(function () {
  "use strict";

  var loginSection = document.getElementById("login-section");
  var scanSection = document.getElementById("scan-section");
  var configNotice = document.getElementById("config-notice");
  var loginForm = document.getElementById("login-form");
  var loginStatus = document.getElementById("login-status");
  var logoutBtn = document.getElementById("logout-btn");
  var staffEmailEl = document.getElementById("staff-email");

  var cameraBtn = document.getElementById("camera-btn");
  var scanVideo = document.getElementById("scan-video");
  var scanHint = document.getElementById("scan-hint");

  var phoneLookupForm = document.getElementById("phone-lookup-form");
  var lookupStatus = document.getElementById("lookup-status");

  var customerResult = document.getElementById("customer-result");
  var resultName = document.getElementById("result-name");
  var resultPoints = document.getElementById("result-points");
  var addPointBtn = document.getElementById("add-point-btn");

  var rewardAlert = document.getElementById("reward-alert");
  var rewardAlertText = document.getElementById("reward-alert-text");
  var redeemBtn = document.getElementById("redeem-btn");

  var threshold = window.LOYALTY_REWARD_THRESHOLD || 8;
  var supabaseClient = window.getSupabaseClient();

  if (!supabaseClient) {
    loginForm.hidden = true;
    configNotice.hidden = false;
    return;
  }

  var currentCustomer = null; // { id, first_name, points }
  var cameraStream = null;
  var scanLoopHandle = null;
  var canvas = document.createElement("canvas");
  var canvasCtx = canvas.getContext("2d", { willReadFrequently: true });

  /* ============ AUTH ============ */

  async function refreshSession() {
    var { data } = await supabaseClient.auth.getSession();
    if (data.session) {
      loginSection.hidden = true;
      scanSection.hidden = false;
      staffEmailEl.textContent = data.session.user.email;
    } else {
      loginSection.hidden = false;
      scanSection.hidden = true;
      stopCamera();
    }
  }

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = document.getElementById("login-email").value.trim();
    var password = document.getElementById("login-password").value;
    loginStatus.textContent = "Connexion...";
    loginStatus.removeAttribute("data-state");

    var { error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
    if (error) {
      loginStatus.textContent = "Identifiants incorrects.";
      loginStatus.setAttribute("data-state", "err");
      return;
    }
    loginStatus.textContent = "";
    refreshSession();
  });

  logoutBtn.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    refreshSession();
  });

  /* ============ CAMERA + QR SCAN ============ */

  function extractIdFromDecodedText(text) {
    try {
      var url = new URL(text);
      var id = url.searchParams.get("id");
      if (id) return id;
    } catch (_e) {
      // not a URL — maybe the raw id was encoded directly
    }
    var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(text.trim()) ? text.trim() : null;
  }

  function scanFrame() {
    if (!cameraStream) return;
    if (scanVideo.readyState === scanVideo.HAVE_ENOUGH_DATA) {
      canvas.width = scanVideo.videoWidth;
      canvas.height = scanVideo.videoHeight;
      canvasCtx.drawImage(scanVideo, 0, 0, canvas.width, canvas.height);
      var imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
      var code = window.jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        var id = extractIdFromDecodedText(code.data);
        if (id) {
          scanHint.textContent = "Carte détectée !";
          stopCamera();
          resolveCustomerById(id);
          return;
        }
      }
    }
    scanLoopHandle = requestAnimationFrame(scanFrame);
  }

  async function startCamera() {
    if (typeof window.jsQR === "undefined") {
      scanHint.textContent = "Le lecteur de QR code n'a pas pu se charger — utilisez la recherche par téléphone.";
      return;
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch (_e) {
      scanHint.textContent = "Impossible d'accéder à la caméra — vérifiez les autorisations, ou utilisez la recherche par téléphone.";
      return;
    }
    scanVideo.srcObject = cameraStream;
    await scanVideo.play();
    cameraBtn.textContent = "Désactiver la caméra";
    scanHint.textContent = "Placez le QR code du client dans le cadre.";
    scanLoopHandle = requestAnimationFrame(scanFrame);
  }

  function stopCamera() {
    if (scanLoopHandle) cancelAnimationFrame(scanLoopHandle);
    scanLoopHandle = null;
    if (cameraStream) {
      cameraStream.getTracks().forEach(function (t) { t.stop(); });
      cameraStream = null;
    }
    scanVideo.srcObject = null;
    cameraBtn.textContent = "Activer la caméra";
  }

  cameraBtn.addEventListener("click", function () {
    if (cameraStream) stopCamera();
    else startCamera();
  });

  window.addEventListener("beforeunload", stopCamera);

  /* ============ PHONE LOOKUP ============ */

  phoneLookupForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var phone = document.getElementById("lookup-phone").value.trim();
    lookupStatus.textContent = "Recherche...";
    lookupStatus.removeAttribute("data-state");

    var { data, error } = await supabaseClient
      .from("loyalty_customers")
      .select("id, first_name, points")
      .eq("phone", phone)
      .maybeSingle();

    if (error || !data) {
      lookupStatus.textContent = "Aucun client trouvé avec ce numéro.";
      lookupStatus.setAttribute("data-state", "err");
      customerResult.hidden = true;
      return;
    }

    lookupStatus.textContent = "";
    showCustomer(data);
  });

  async function resolveCustomerById(id) {
    var { data, error } = await supabaseClient
      .from("loyalty_customers")
      .select("id, first_name, points")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      scanHint.textContent = "QR code non reconnu.";
      return;
    }
    showCustomer(data);
  }

  /* ============ CUSTOMER RESULT + POINTS ============ */

  function showCustomer(customer) {
    currentCustomer = customer;
    rewardAlert.hidden = true;
    customerResult.hidden = false;
    resultName.textContent = customer.first_name;
    resultPoints.textContent = customer.points + " / " + threshold + " points";
  }

  addPointBtn.addEventListener("click", async function () {
    if (!currentCustomer) return;
    addPointBtn.disabled = true;

    var { data, error } = await supabaseClient.rpc("loyalty_add_point", {
      p_customer_id: currentCustomer.id,
      p_threshold: threshold,
    });

    addPointBtn.disabled = false;

    if (error || !data || data.length === 0) {
      lookupStatus.textContent = "Échec de l'ajout du point — réessayez.";
      lookupStatus.setAttribute("data-state", "err");
      return;
    }

    var result = data[0];
    currentCustomer.points = result.points;
    resultPoints.textContent = result.points + " / " + threshold + " points";

    if (result.reward_unlocked) {
      rewardAlertText.textContent =
        "🎉 " + result.first_name + " vient d'atteindre " + result.points + " points — consommation offerte !";
      rewardAlert.hidden = false;
    }
  });

  redeemBtn.addEventListener("click", async function () {
    if (!currentCustomer) return;
    redeemBtn.disabled = true;
    await supabaseClient.rpc("loyalty_redeem_reward", { p_customer_id: currentCustomer.id });
    redeemBtn.disabled = false;
    currentCustomer.points = 0;
    resultPoints.textContent = "0 / " + threshold + " points";
    rewardAlert.hidden = true;
  });

  refreshSession();
})();
