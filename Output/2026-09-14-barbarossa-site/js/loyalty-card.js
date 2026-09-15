(function () {
  "use strict";

  var signupPanel = document.getElementById("signup-panel");
  var cardPanel = document.getElementById("card-panel");
  var configNotice = document.getElementById("loyalty-config-notice");
  var signupForm = document.getElementById("signup-form");
  var signupStatus = document.getElementById("signup-status");

  var threshold = window.LOYALTY_REWARD_THRESHOLD || 8;
  var supabaseClient = window.getSupabaseClient();

  if (!supabaseClient) {
    signupForm.hidden = true;
    configNotice.hidden = false;
    return;
  }

  function cardUrlFor(id) {
    return location.origin + location.pathname + "?id=" + encodeURIComponent(id);
  }

  function renderProgressDots(points) {
    var container = document.getElementById("card-progress");
    container.innerHTML = "";
    var filled = Math.min(points, threshold);
    for (var i = 0; i < threshold; i++) {
      var dot = document.createElement("span");
      dot.className = "loyalty-dot" + (i < filled ? " is-filled" : "");
      container.appendChild(dot);
    }
  }

  function renderCard(id, card) {
    signupPanel.hidden = true;
    cardPanel.hidden = false;

    document.getElementById("card-first-name").textContent = card.first_name;
    renderProgressDots(card.points);

    var rewardReady = card.points >= threshold;
    document.getElementById("reward-banner").hidden = !rewardReady;
    document.getElementById("card-progress-label").textContent = rewardReady
      ? "Ta prochaine consommation est offerte !"
      : card.points + " / " + threshold + " vers ta consommation offerte";

    var qrContainer = document.getElementById("qr-code");
    var downloadBtn = document.getElementById("download-qr-btn");
    qrContainer.innerHTML = "";

    if (typeof QRCode === "undefined") {
      qrContainer.textContent = "QR code indisponible pour l'instant — ce lien reste ta carte : " + cardUrlFor(id);
      downloadBtn.hidden = true;
      return;
    }

    new QRCode(qrContainer, {
      text: cardUrlFor(id),
      width: 200,
      height: 200,
      colorDark: "#1d3323",
      colorLight: "#fffdf7",
    });

    downloadBtn.hidden = false;
    downloadBtn.onclick = function () {
      var canvas = qrContainer.querySelector("canvas");
      if (!canvas) return;
      var link = document.createElement("a");
      link.download = "carte-barbarossa-" + card.first_name.toLowerCase() + ".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
  }

  async function loadCard(id) {
    var { data, error } = await supabaseClient.rpc("loyalty_get_card", { p_id: id });
    if (error || !data || data.length === 0) {
      return false;
    }
    renderCard(id, data[0]);
    return true;
  }

  signupForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var submitBtn = signupForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    signupStatus.textContent = "Création de ta carte...";
    signupStatus.removeAttribute("data-state");

    var firstName = document.getElementById("signup-first-name").value.trim();
    var phone = document.getElementById("signup-phone").value.trim();

    var { data: id, error } = await supabaseClient.rpc("loyalty_signup", {
      p_first_name: firstName,
      p_phone: phone,
    });

    if (error || !id) {
      signupStatus.textContent = "Une erreur est survenue — réessaie dans un instant.";
      signupStatus.setAttribute("data-state", "err");
      submitBtn.disabled = false;
      return;
    }

    history.replaceState(null, "", "?id=" + encodeURIComponent(id));
    await loadCard(id);
  });

  var params = new URLSearchParams(location.search);
  var existingId = params.get("id");
  if (existingId) {
    loadCard(existingId).then(function (found) {
      if (!found) {
        // Bad/old link: fall back to the signup form instead of a dead page.
        history.replaceState(null, "", location.pathname);
      }
    });
  }
})();
