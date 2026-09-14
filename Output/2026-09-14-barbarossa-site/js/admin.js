(function () {
  "use strict";

  var loginSection = document.getElementById("login-section");
  var dashboardSection = document.getElementById("dashboard-section");
  var configNotice = document.getElementById("config-notice");

  var loginForm = document.getElementById("login-form");
  var loginStatus = document.getElementById("login-status");
  var logoutBtn = document.getElementById("logout-btn");
  var adminEmailEl = document.getElementById("admin-email");

  var eventForm = document.getElementById("event-form");
  var eventFormTitle = document.getElementById("event-form-title");
  var eventFormStatus = document.getElementById("event-form-status");
  var eventIdInput = document.getElementById("event-id");
  var eventSubmitBtn = document.getElementById("event-submit-btn");
  var eventCancelBtn = document.getElementById("event-cancel-btn");

  var eventsListEl = document.getElementById("admin-events-list");
  var eventsEmptyEl = document.getElementById("admin-events-empty");

  var supabaseClient = window.getSupabaseClient();

  if (!supabaseClient) {
    loginForm.hidden = true;
    configNotice.hidden = false;
    return;
  }

  function formatDateTime(dateStr, timeStr) {
    var d = new Date(dateStr + "T00:00:00");
    var s = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    return s + " · " + timeStr.slice(0, 5).replace(":", "h");
  }

  /* ============ AUTH ============ */

  async function refreshSession() {
    var { data } = await supabaseClient.auth.getSession();
    if (data.session) {
      loginSection.hidden = true;
      dashboardSection.hidden = false;
      adminEmailEl.textContent = data.session.user.email;
      loadEvents();
    } else {
      loginSection.hidden = false;
      dashboardSection.hidden = true;
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

  /* ============ EVENT FORM (create / edit) ============ */

  function resetEventForm() {
    eventForm.reset();
    eventIdInput.value = "";
    eventFormTitle.textContent = "Nouvelle soirée";
    eventSubmitBtn.textContent = "Ajouter la soirée";
    eventCancelBtn.hidden = true;
    eventFormStatus.textContent = "";
    eventFormStatus.removeAttribute("data-state");
  }

  function fillEventForm(event) {
    eventIdInput.value = event.id;
    document.getElementById("event-title").value = event.title;
    document.getElementById("event-description").value = event.description;
    document.getElementById("event-date").value = event.event_date;
    document.getElementById("event-time").value = event.event_time.slice(0, 5);
    document.getElementById("event-accent").value = event.accent;
    eventFormTitle.textContent = "Modifier la soirée";
    eventSubmitBtn.textContent = "Enregistrer les modifications";
    eventCancelBtn.hidden = false;
    window.scrollTo({ top: eventForm.getBoundingClientRect().top + window.scrollY - 100, behavior: "smooth" });
  }

  eventCancelBtn.addEventListener("click", resetEventForm);

  eventForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    eventSubmitBtn.disabled = true;
    eventFormStatus.textContent = "Enregistrement...";
    eventFormStatus.removeAttribute("data-state");

    var payload = {
      title: document.getElementById("event-title").value.trim(),
      description: document.getElementById("event-description").value.trim(),
      event_date: document.getElementById("event-date").value,
      event_time: document.getElementById("event-time").value,
      accent: document.getElementById("event-accent").value,
    };

    var id = eventIdInput.value;
    var query = id
      ? supabaseClient.from("events").update(payload).eq("id", id)
      : supabaseClient.from("events").insert(payload);

    var { error } = await query;

    eventSubmitBtn.disabled = false;

    if (error) {
      eventFormStatus.textContent = "Échec de l'enregistrement (" + error.message + ").";
      eventFormStatus.setAttribute("data-state", "err");
      return;
    }

    resetEventForm();
    loadEvents();
  });

  /* ============ EVENTS LIST + REGISTRATIONS ============ */

  async function deleteEvent(id) {
    if (!confirm("Supprimer cette soirée et toutes ses inscriptions ?")) return;
    await supabaseClient.from("events").delete().eq("id", id);
    loadEvents();
  }

  async function toggleRegistrations(event, container) {
    var existing = container.querySelector(".admin-registrations");
    if (existing) {
      existing.remove();
      return;
    }

    var box = document.createElement("div");
    box.className = "admin-registrations";
    box.textContent = "Chargement...";
    container.appendChild(box);

    var { data, error } = await supabaseClient
      .from("registrations")
      .select("first_name, email, phone, reminder_sent_at, created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true });

    if (error) {
      box.textContent = "Erreur de chargement.";
      return;
    }

    if (!data || data.length === 0) {
      box.textContent = "Aucune inscription pour l'instant.";
      return;
    }

    var table = document.createElement("table");
    table.className = "hours-table admin-reg-table";
    table.innerHTML =
      "<thead><tr><th>Prénom</th><th>Email</th><th>Téléphone</th><th>Rappel</th></tr></thead><tbody></tbody>";
    var tbody = table.querySelector("tbody");
    data.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td></td><td></td><td></td><td></td>";
      tr.children[0].textContent = r.first_name;
      tr.children[1].textContent = r.email;
      tr.children[2].textContent = r.phone || "—";
      tr.children[3].textContent = r.reminder_sent_at ? "Envoyé" : "En attente";
      tbody.appendChild(tr);
    });

    box.textContent = "";
    box.appendChild(table);
  }

  async function loadEvents() {
    eventsListEl.innerHTML = "";
    var { data, error } = await supabaseClient
      .from("events")
      .select("id, title, description, event_date, event_time, accent")
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });

    if (error || !data || data.length === 0) {
      eventsEmptyEl.hidden = false;
      return;
    }
    eventsEmptyEl.hidden = true;

    data.forEach(function (event) {
      var row = document.createElement("div");
      row.className = "admin-event-row";
      row.innerHTML =
        '<div class="admin-event-row-main">' +
        '<span class="admin-event-dot admin-event-dot-' + event.accent + '"></span>' +
        "<div>" +
        '<p class="admin-event-title"></p>' +
        '<p class="admin-event-meta"></p>' +
        "</div>" +
        "</div>" +
        '<div class="admin-event-actions">' +
        '<button type="button" class="btn btn-ghost btn-small" data-action="registrations">Inscrits</button>' +
        '<button type="button" class="btn btn-ghost btn-small" data-action="edit">Modifier</button>' +
        '<button type="button" class="btn btn-ghost btn-small" data-action="delete">Supprimer</button>' +
        "</div>";

      row.querySelector(".admin-event-title").textContent = event.title;
      row.querySelector(".admin-event-meta").textContent = formatDateTime(event.event_date, event.event_time);

      row.querySelector('[data-action="edit"]').addEventListener("click", function () {
        fillEventForm(event);
      });
      row.querySelector('[data-action="delete"]').addEventListener("click", function () {
        deleteEvent(event.id);
      });
      row.querySelector('[data-action="registrations"]').addEventListener("click", function () {
        toggleRegistrations(event, row);
      });

      eventsListEl.appendChild(row);
    });
  }

  refreshSession();
})();
