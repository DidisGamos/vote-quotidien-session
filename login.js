const form = document.getElementById("login-form");
const passwordInput = document.getElementById("login-password");
const submitBtn = document.getElementById("login-submit");
const errorEl = document.getElementById("login-error");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function hideError() {
  errorEl.hidden = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();
  submitBtn.disabled = true;
  submitBtn.textContent = "Connexion…";

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput.value }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showError(data.error || "Une erreur est survenue, réessayez.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Se connecter";
      passwordInput.select();
      return;
    }

    window.location.href = "/admin";
  } catch {
    showError("Impossible de contacter le serveur. Réessayez.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Se connecter";
  }
});
