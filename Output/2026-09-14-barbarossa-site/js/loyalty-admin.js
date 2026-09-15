(function () {
  "use strict";

  var loginSection = document.getElementById("login-section");
  var listSection = document.getElementById("list-section");
  var configNotice = document.getElementById("config-notice");
  var loginForm = document.getElementById("login-form");
  var loginStatus = document.getElementById("login-status");
  var logoutBtn = document.getElementById("logout-btn");
  var staffEmailEl = document.getElementById("staff-email");
  var searchInput = document.getElementById("search-input");
  var tbody = document.getElementById("customers-tbody");
  var emptyEl = document.getElementById("customers-empty");

  var threshold = window.LOYALTY_REWARD_THRESHOLD || 8;
  var supabaseClient = window.getSupabaseClient();
  var allCustomers = [];

  if (!supabaseClient) {
    loginForm.hidden = true;
    configNotice.hidden = false;
    return;
  }

  async function refreshSession() {
    var { data } = await supabaseClient.auth.getSession();
    if (data.session) {
      loginSection.hidden = true;
      listSection.hidden = false;
      staffEmailEl.textContent = data.session.user.email;
      loadCustomers();
    } else {
      loginSection.hidden = false;
      listSection.hidden = true;
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

  function formatLastVisit(value) {
    if (!value) return "Jamais";
    var d = new Date(value);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  }

  function renderRows(customers) {
    tbody.innerHTML = "";
    emptyEl.hidden = customers.length > 0;

    customers.forEach(function (c) {
      var tr = document.createElement("tr");

      var nameCell = document.createElement("td");
      nameCell.textContent = c.first_name;
      if (c.points >= threshold) {
        var badge = document.createElement("span");
        badge.className = "loyalty-badge loyalty-badge-ready";
        badge.textContent = "Récompense prête";
        nameCell.appendChild(document.createTextNode(" "));
        nameCell.appendChild(badge);
      } else if (c.points >= threshold - 2) {
        var badge2 = document.createElement("span");
        badge2.className = "loyalty-badge loyalty-badge-soon";
        badge2.textContent = "Bientôt";
        nameCell.appendChild(document.createTextNode(" "));
        nameCell.appendChild(badge2);
      }

      var phoneCell = document.createElement("td");
      phoneCell.textContent = c.phone;

      var pointsCell = document.createElement("td");
      pointsCell.textContent = c.points + " / " + threshold;

      var rewardsCell = document.createElement("td");
      rewardsCell.textContent = c.rewards_earned;

      var visitCell = document.createElement("td");
      visitCell.textContent = formatLastVisit(c.last_visit);

      tr.appendChild(nameCell);
      tr.appendChild(phoneCell);
      tr.appendChild(pointsCell);
      tr.appendChild(rewardsCell);
      tr.appendChild(visitCell);
      tbody.appendChild(tr);
    });
  }

  async function loadCustomers() {
    var { data, error } = await supabaseClient
      .from("loyalty_customers")
      .select("id, first_name, phone, points, rewards_earned, last_visit")
      .order("last_visit", { ascending: false, nullsFirst: false });

    if (error) {
      emptyEl.hidden = false;
      emptyEl.textContent = "Erreur de chargement (" + error.message + ").";
      return;
    }

    allCustomers = data || [];
    renderRows(allCustomers);
  }

  searchInput.addEventListener("input", function () {
    var q = searchInput.value.trim().toLowerCase();
    if (!q) {
      renderRows(allCustomers);
      return;
    }
    renderRows(
      allCustomers.filter(function (c) {
        return c.first_name.toLowerCase().indexOf(q) !== -1 || c.phone.indexOf(q) !== -1;
      })
    );
  });

  refreshSession();
})();
