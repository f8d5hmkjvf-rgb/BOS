(function () {
  "use strict";

  /* ============ ALWAYS START A NEW PAGE AT THE TOP ============
     Some browsers (mobile Safari/Chrome especially) restore the scroll
     position of the previous page when navigating to a new one, which
     makes a link to a fresh page land halfway or fully scrolled down.
     Force every navigation to start at the top instead. */
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  window.scrollTo(0, 0);
  window.addEventListener("pageshow", function () {
    window.scrollTo(0, 0);
  });

  /* ---- Config -----------------------------------------------------
     Adresse email qui recevra les demandes de réservation (page
     reservation.html). Remplacez-la par la vraie adresse du bar.
     Le premier envoi vers une nouvelle adresse FormSubmit demande une
     confirmation par mail (à valider une seule fois) — voir README.md.
     Si le bar utilise déjà un outil de réservation (Zenchef, TheFork...),
     remplacez le formulaire de reservation.html par le widget fourni.
  ------------------------------------------------------------------ */
  var RESERVATION_EMAIL = "contact@barbarossa-salernes.fr";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ============ HEADER ON SCROLL ============ */
  var header = document.getElementById("site-header");
  function onScroll() {
    if (window.scrollY > 20) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
    }
  }
  if (header) {
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ============ MOBILE NAV (slide-in drawer) ============ */
  var burger = document.getElementById("burger");
  var mobileNav = document.getElementById("mobile-nav");
  var navBackdrop = document.getElementById("nav-backdrop");

  function closeMobileNav() {
    mobileNav.classList.remove("is-open");
    navBackdrop.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  function openMobileNav() {
    mobileNav.classList.add("is-open");
    navBackdrop.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
  if (burger && mobileNav && navBackdrop) {
    burger.addEventListener("click", function () {
      var isOpen = burger.getAttribute("aria-expanded") === "true";
      if (isOpen) closeMobileNav(); else openMobileNav();
    });
    navBackdrop.addEventListener("click", closeMobileNav);
    mobileNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMobileNav);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMobileNav();
    });
  }

  /* ============ SCROLL REVEAL ============ */
  var revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealEls.forEach(function (el) { el.classList.add("is-visible"); });
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
      );
      revealEls.forEach(function (el, i) {
        el.style.setProperty("--i", i % 6);
        io.observe(el);
      });
    }
  }

  /* ============ RESERVATION FORM (reservation.html) ============ */
  var form = document.getElementById("reservation-form");
  if (form) {
    var status = document.getElementById("form-status");
    var dateInput = document.getElementById("res-date");

    if (dateInput) {
      var today = new Date().toISOString().split("T")[0];
      dateInput.setAttribute("min", today);
    }

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
  }

  var yearEls = document.querySelectorAll("#year");
  yearEls.forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
