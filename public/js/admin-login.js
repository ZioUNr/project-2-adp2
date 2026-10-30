const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const loginButton = loginForm.querySelector('button[type="submit"]');

const showLoginError = (text) => {
    loginMessage.textContent = text;
    loginMessage.hidden = false;
};

fetch("/api/admin/session", { headers: { Accept: "application/json" } })
    .then((response) => response.json())
    .then((session) => {
        if (session.authenticated) {
            location.replace("/admin/");
        }
    })
    .catch(() => showLoginError("Не удалось связаться с сервером. Обновите страницу и попробуйте снова."));

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginMessage.hidden = true;
    loginButton.disabled = true;
    const formData = new FormData(loginForm);
    try {
        const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                email: formData.get("email"),
                password: formData.get("password")
            })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Не удалось войти.");
        }
        location.replace("/admin/");
    } catch (error) {
        showLoginError(error.message);
    } finally {
        loginButton.disabled = false;
    }
});
