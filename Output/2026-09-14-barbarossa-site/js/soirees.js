(function () {
  "use strict";

  var listEl = document.getElementById("events-list");
  var emptyEl = document.getElementById("events-empty");
  var configEl = document.getElementById("events-config-notice");

  var modal = document.getElementById("registration-modal");
  var form = document.getElementById("registration-form");
  var status = document.getElementById("registration-status");
  var modalEventTitle = document.getElementById("modal-event-title");
  var eventIdInput = document.getElementById("reg-event-id");

  var ACCENT_LABEL = {
    gold: "Or",
    green: "Vert",
    terracotta: "Terracotta",
    olive: "Olive",
  };

  function openModal(event) {
    eventIdInput.value = event.id;
    modalEventTitle.textContent = event.title;
    status.textContent = "";
    status.removeAttribute("data-state");
    form.reset();
    eventIdInput.value = event.id;
    if (typeof modal.showModal === "function") modal.showModal();
    else modal.setAttribute("open", "");
  }

  function closeModal() {
    if (typeof modal.close === "function") modal.close();
    else modal.removeAttribute("open");
  }

  window.addEventListener("click", function (e) {
    if (e.target && e.target.closest && e.target.closest("[data-close-modal]")) closeModal();
  });
  if (modal) {
    modal.addEventListener("click", function (e) {
      var rect = modal.getBoundingClientRect();
      var outside =
        e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
      if (outside) closeModal();
    });
  }

  function formatDateLong(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    var s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function formatTime(timeStr) {
    return timeStr.slice(0, 5).replace(":", "h");
  }

  function eventCard(event) {
    var card = document.createElement("article");
    card.className = "event-card reveal";
    card.innerHTML =
      '<div class="event-visual event-visual-' +
      event.accent +
      '" aria-hidden="true"></div>' +
      '<div class="event-body">' +
      '<p class="event-day">' +
      formatDateLong(event.event_date) +
      " · " +
      formatTime(event.event_time) +
      "</p>" +
      '<h3 class="event-name"></h3>' +
      '<p class="event-desc"></p>' +
      '<button type="button" class="btn btn-accent btn-small" data-signup>Je m\'inscris</button>' +
      "</div>";
    card.querySelector(".event-name").textContent = event.title;
    card.querySelector(".event-desc").textContent = event.description;
    card.querySelector("[data-signup]").addEventListener("click", function () {
      openModal(event);
    });
    return card;
  }

  async function loadEvents() {
    var supabaseClient = window.getSupabaseClient();
    if (!supabaseClient) {
      configEl.hidden = false;
      return;
    }

    var today = new Date().toISOString().slice(0, 10);
    var { data, error } = await supabaseClient
      .from("events")
      .select("id, title, description, event_date, event_time, accent")
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });

    if (error) {
      configEl.hidden = false;
      configEl.querySelector("p").textContent =
        "Impossible de charger les événements (" + error.message + ").";
      return;
    }

    if (!data || data.length === 0) {
      emptyEl.hidden = false;
      return;
    }

    data.forEach(function (event) {
      listEl.appendChild(eventCard(event));
    });

    if (window.observeReveal) window.observeReveal(listEl.querySelectorAll(".reveal"));
  }

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var supabaseClient = window.getSupabaseClient();
      if (!supabaseClient) return;

      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      status.textContent = "Inscription en cours...";
      status.removeAttribute("data-state");

      var payload = {
        event_id: eventIdInput.value,
        first_name: form.first_name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim() || null,
      };

      var { error } = await supabaseClient.from("registrations").insert(payload);

      if (error) {
        if (error.code === "23505") {
          status.textContent = "Vous êtes déjà inscrit·e à cette soirée avec cet email.";
        } else {
          status.textContent = "L'inscription a échoué — réessayez dans un instant.";
        }
        status.setAttribute("data-state", "err");
      } else {
        status.textContent = "Inscription confirmée ! Un rappel vous sera envoyé 24h avant.";
        status.setAttribute("data-state", "ok");
        form.reset();
        eventIdInput.value = payload.event_id;
        setTimeout(closeModal, 1800);
      }

      submitBtn.disabled = false;
    });
  }

  if (listEl) loadEvents();
})();
