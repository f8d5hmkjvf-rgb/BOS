(function () {
  "use strict";

  /* ---- Eventbrite Embedded Checkout -------------------------------
     Pour chaque événement de la page (voir soirees.html), on crée un
     widget de checkout Eventbrite déclenché par le bouton "S'inscrire"
     correspondant. Le paiement/l'inscription se passe entièrement dans
     la fenêtre modale fournie par Eventbrite — rien à héberger, rien à
     stocker de notre côté.

     Pour connecter un vrai événement : dans soirees.html, remplacez la
     valeur data-eventbrite-id de chaque .event-card par l'ID numérique
     de l'événement (visible dans l'URL Eventbrite ou dans le tableau
     de bord organisateur). Un ID qui commence encore par "VOTRE-ID"
     désactive le bouton correspondant (voir plus bas).
  ------------------------------------------------------------------ */

  function disableAll(reason) {
    document.querySelectorAll("[data-eventbrite-trigger]").forEach(function (btn) {
      btn.disabled = true;
      btn.title = reason;
    });
  }

  function initWidgets() {
    if (!window.EBWidgets) {
      disableAll("Le widget Eventbrite n'a pas pu se charger (bloqué ou hors ligne).");
      return;
    }

    document.querySelectorAll("[data-eventbrite-id]").forEach(function (card) {
      var eventId = card.getAttribute("data-eventbrite-id");
      var button = card.querySelector("[data-eventbrite-trigger]");
      if (!button) return;

      if (!eventId || eventId.indexOf("VOTRE-ID") === 0) {
        button.disabled = true;
        button.title = "Événement non connecté à Eventbrite pour l'instant";
        return;
      }

      var triggerId = "eb-trigger-" + eventId;
      button.id = triggerId;

      window.EBWidgets.createWidget({
        widgetType: "checkout",
        eventId: eventId,
        modal: true,
        modalTriggerElementId: triggerId,
        onOrderComplete: function () {
          button.textContent = "Inscription confirmée";
          button.disabled = true;
        },
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidgets);
  } else {
    initWidgets();
  }
})();
