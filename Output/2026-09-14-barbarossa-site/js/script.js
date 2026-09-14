(function () {
  "use strict";

  /* ---- Config -----------------------------------------------------
     Adresse email qui recevra les demandes de réservation.
     Remplacez-la par la vraie adresse du bar. Le premier envoi vers
     une nouvelle adresse FormSubmit demande une confirmation par mail
     (à valider une seule fois) — voir README.md.
     Si le bar utilise déjà un outil de réservation (Zenchef, TheFork...),
     remplacez le formulaire par le widget/iframe fourni par cet outil.
  ------------------------------------------------------------------ */
  var RESERVATION_EMAIL = "contact@barbarossa-salernes.fr";

  var header = document.getElementById("site-header");
  var burger = document.getElementById("burger");
  var mobileNav = document.getElementById("mobile-nav");
  var modal = document.getElementById("reservation-modal");
  var form = document.getElementById("reservation-form");
  var status = document.getElementById("form-status");
  var dateInput = document.getElementById("res-date");

  /* Header background on scroll */
  function onScroll() {
    if (window.scrollY > 20) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
    }
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Mobile nav */
  function closeMobileNav() {
    mobileNav.hidden = true;
    burger.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  function openMobileNav() {
    mobileNav.hidden = false;
    burger.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
  burger.addEventListener("click", function () {
    var isOpen = burger.getAttribute("aria-expanded") === "true";
    if (isOpen) closeMobileNav(); else openMobileNav();
  });
  mobileNav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", closeMobileNav);
  });

  /* Reservation modal */
  function openModal() {
    if (mobileNav && !mobileNav.hidden) closeMobileNav();
    if (typeof modal.showModal === "function") {
      modal.showModal();
    } else {
      modal.setAttribute("open", "");
    }
  }
  function closeModal() {
    if (typeof modal.close === "function") {
      modal.close();
    } else {
      modal.removeAttribute("open");
    }
  }
  document.querySelectorAll("[data-open-reservation]").forEach(function (btn) {
    btn.addEventListener("click", openModal);
  });
  modal.addEventListener("click", function (e) {
    var rect = modal.getBoundingClientRect();
    var clickedOutside =
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top || e.clientY > rect.bottom;
    if (clickedOutside) closeModal();
  });

  /* Prevent picking a date in the past */
  if (dateInput) {
    var today = new Date().toISOString().split("T")[0];
    dateInput.setAttribute("min", today);
  }

  /* Submit reservation via FormSubmit (no backend needed) */
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    if (form.querySelector('[name="_honey"]').value) {
      return; // honeypot triggered, silently drop
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    var data = new FormData(form);
    data.append("_subject", "Nouvelle demande de réservation — Barbarossa");
    data.append("_captcha", "false");
    data.append("_template", "table");

    submitBtn.disabled = true;
    status.textContent = "Envoi en cours...";
    status.removeAttribute("data-state");

    fetch("https://formsubmit.co/ajax/" + encodeURIComponent(RESERVATION_EMAIL), {
      method: "POST",
      headers: { Accept: "application/json" },
      body: data
    })
      .then(function (res) {
        if (!res.ok) throw new Error("network");
        status.textContent = "Merci ! Votre demande a bien été envoyée, on vous confirme rapidement.";
        status.setAttribute("data-state", "ok");
        form.reset();
      })
      .catch(function () {
        status.textContent = "L'envoi a échoué — appelez-nous directement, ou réessayez dans un instant.";
        status.setAttribute("data-state", "err");
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
