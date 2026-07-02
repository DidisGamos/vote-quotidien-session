const form = document.getElementById("identification-form");
const idInput = document.getElementById("identification-id");
const submitBtn = document.getElementById("identification-submit");
const errorEl = document.getElementById("identification-error");

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
  submitBtn.textContent = "Vérification…";

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: idInput.value.trim() }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showError(data.error || "Une erreur est survenue, réessayez.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Continuer";
      idInput.select();
      return;
    }

    window.location.href = "/";
  } catch {
    showError("Impossible de contacter le serveur. Réessayez.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Continuer";
  }
});
