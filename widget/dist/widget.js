/*! @petidentity/widget — embeddable PetID partner widget. https://petid.eth.link */
(function () {
  "use strict";

  var BASE_URL = "https://petid.eth.link/register/";
  var PAW =
    '<svg width="16" height="16" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true" style="flex-shrink:0">' +
    '<ellipse cx="20" cy="26" rx="9" ry="8"/><ellipse cx="9" cy="16" rx="4" ry="5"/>' +
    '<ellipse cx="31" cy="16" rx="4" ry="5"/><ellipse cx="15" cy="8" rx="3.2" ry="4"/>' +
    '<ellipse cx="25" cy="8" rx="3.2" ry="4"/></svg>';

  function registerUrl(opts) {
    var url = (opts.url || BASE_URL).replace(/\/?$/, "/");
    return url + "?partner=" + encodeURIComponent(opts.partner);
  }

  function makeButton(opts) {
    var a = document.createElement("a");
    a.href = registerUrl(opts);
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("data-petid-widget", "");
    var dark = opts.theme === "dark";
    a.style.cssText =
      "display:inline-flex;align-items:center;gap:8px;padding:12px 22px;" +
      "border-radius:12px;font:600 15px/1 system-ui,-apple-system,sans-serif;" +
      "text-decoration:none;cursor:pointer;transition:filter .15s;" +
      (dark
        ? "background:#3D2817;color:#FBF5EC;"
        : "background:#C87A2E;color:#FFFDF8;") +
      "box-shadow:0 4px 14px rgba(61,40,23,.22);";
    a.onmouseenter = function () { a.style.filter = "brightness(.93)"; };
    a.onmouseleave = function () { a.style.filter = ""; };
    a.innerHTML = PAW + "<span>" + (opts.label || "Create your pet’s PetID") + "</span>";
    return a;
  }

  function makeFrame(opts) {
    var f = document.createElement("iframe");
    f.src = registerUrl(opts);
    f.title = "PetID registration";
    f.setAttribute("data-petid-widget", "");
    f.style.cssText =
      "width:100%;max-width:" + (opts.width || "680px") + ";height:" +
      (opts.height || "760px") + ";border:0;border-radius:16px;" +
      "box-shadow:0 4px 24px rgba(61,40,23,.12);";
    return f;
  }

  function mount(el, opts) {
    if (!el) throw new Error("PetIDWidget: mount element not found");
    if (!opts || !opts.partner || !/^0x[0-9a-fA-F]{40}$/.test(opts.partner))
      throw new Error("PetIDWidget: a valid partner address (0x…) is required");
    var node = opts.mode === "inline" ? makeFrame(opts) : makeButton(opts);
    el.appendChild(node);
    return node;
  }

  window.PetIDWidget = { mount: mount, version: "0.1.0" };

  // auto-init from the script tag: <script src="…" data-partner="0x…"></script>
  var script = document.currentScript;
  if (script && script.getAttribute("data-partner")) {
    var opts = {
      partner: script.getAttribute("data-partner"),
      label: script.getAttribute("data-label") || undefined,
      theme: script.getAttribute("data-theme") || undefined,
      mode: script.getAttribute("data-mode") || undefined,
      width: script.getAttribute("data-width") || undefined,
      height: script.getAttribute("data-height") || undefined,
      url: script.getAttribute("data-url") || undefined,
    };
    var target = script.getAttribute("data-target");
    var el = target ? document.querySelector(target) : null;
    var place = function () {
      try {
        mount(el || script.parentNode, opts);
      } catch (e) {
        console.error(e);
      }
    };
    if (document.readyState === "loading" && target) {
      document.addEventListener("DOMContentLoaded", place);
    } else {
      place();
    }
  }
})();
