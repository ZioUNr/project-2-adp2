const contactDetails = document.querySelector("#contact-details");
const appointmentActions = document.querySelector("#appointment-actions");
const addressDetails = document.querySelector("#address-details");

const contactLink = (parent, label, value, href, external = false) => {
    const row = document.createElement("div");
    row.className = "contact-entry";
    const kind = document.createElement("span");
    kind.textContent = label;
    const link = document.createElement("a");
    link.textContent = value;
    link.href = href;
    if (external) {
        link.target = "_blank";
        link.rel = "noreferrer";
    }
    row.append(kind, link);
    parent.append(row);
};

window.Ainazik.request("/api/settings")
    .then((settings) => {
        const hasDetails = settings.phone || settings.whatsapp || settings.instagram || settings.hours;
        if (hasDetails) {
            contactDetails.replaceChildren();
            if (settings.phone) {
                contactLink(contactDetails, "Телефон", settings.phone, `tel:${settings.phone.replace(/[^\d+]/g, "")}`);
            }
            if (settings.whatsapp) {
                const digits = settings.whatsapp.replace(/\D/g, "");
                if (digits) {
                    contactLink(contactDetails, "WhatsApp", settings.whatsapp, `https://wa.me/${digits}`, true);
                }
            }
            if (settings.instagram) {
                contactLink(contactDetails, "Instagram", "Открыть страницу", settings.instagram, true);
            }
            if (settings.hours) {
                const row = document.createElement("div");
                row.className = "contact-entry";
                const label = document.createElement("span");
                label.textContent = "Часы работы";
                const value = document.createElement("div");
                value.textContent = settings.hours;
                row.append(label, value);
                contactDetails.append(row);
            }
        } else {
            const note = document.createElement("p");
            note.className = "loading-note";
            note.textContent = "Контактные данные салона скоро появятся.";
            contactDetails.replaceChildren(note);
        }

        appointmentActions.className = "appointment-actions";
        const whatsappDigits = settings.whatsapp?.replace(/\D/g, "");
        if (whatsappDigits) {
            const whatsapp = document.createElement("a");
            whatsapp.className = "contact-action";
            whatsapp.href = `https://wa.me/${whatsappDigits}`;
            whatsapp.target = "_blank";
            whatsapp.rel = "noreferrer";
            whatsapp.textContent = "Написать в WhatsApp ↗";
            appointmentActions.append(whatsapp);
        }
        if (settings.phone) {
            const call = document.createElement("a");
            call.className = "contact-action";
            call.href = `tel:${settings.phone.replace(/[^\d+]/g, "")}`;
            call.textContent = `Позвонить · ${settings.phone}`;
            appointmentActions.append(call);
        }
        if (!appointmentActions.childElementCount) {
            const note = document.createElement("p");
            note.className = "loading-note";
            note.textContent = "Добавьте телефон или WhatsApp в панели администратора, чтобы посетители могли записаться.";
            appointmentActions.replaceChildren(note);
        }

        const addressText = [settings.city, settings.address].filter(Boolean).join(" · ");
        if (addressText) {
            const note = document.createElement("p");
            note.textContent = addressText;
            addressDetails.replaceChildren(document.createTextNode("⌖ "), note);
        }
    })
    .catch((error) => {
        window.Ainazik.setError(contactDetails, error.message);
        window.Ainazik.setError(appointmentActions, error.message);
    });
