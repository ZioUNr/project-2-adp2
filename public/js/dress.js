const detail = document.querySelector("#dress-detail");
const breadcrumb = document.querySelector("#detail-breadcrumb");
const productId = new URLSearchParams(location.search).get("id");

const createSpec = (label, value) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    return row;
};

if (!productId) {
    window.Ainazik.message(detail, "Образ не найден", "Вернитесь в коллекцию, чтобы выбрать платье.");
} else {
    window.Ainazik.request(`/api/products/${encodeURIComponent(productId)}`)
        .then((product) => {
            document.title = `${product.name} — AINAZIK`;
            breadcrumb.textContent = product.name;
            const layout = document.createElement("div");
            layout.className = "detail-layout";
            const image = document.createElement("img");
            image.className = "detail-photo";
            image.src = product.image;
            image.alt = product.name;
            const copy = document.createElement("div");
            copy.className = "detail-copy";
            const eyebrow = document.createElement("p");
            eyebrow.className = "eyebrow";
            eyebrow.textContent = window.Ainazik.categoryLabels[product.category] || "Коллекция AINAZIK";
            const title = document.createElement("h1");
            title.textContent = product.name;
            const price = document.createElement("p");
            price.className = "detail-price";
            price.textContent = window.Ainazik.formatPrice(product.price);
            const description = document.createElement("p");
            description.className = "detail-description";
            description.textContent = product.description || "Подробности об образе можно уточнить у стилиста салона.";
            const specs = document.createElement("dl");
            specs.className = "detail-specs";
            if (product.sizes) {
                specs.append(createSpec("Размеры", product.sizes));
            }
            if (product.fabric) {
                specs.append(createSpec("Материал", product.fabric));
            }
            const appointment = document.createElement("a");
            appointment.className = "button button-dark";
            appointment.href = "/contacts.html#appointment";
            appointment.append(document.createTextNode("Записаться на примерку "));
            const arrow = document.createElement("span");
            arrow.setAttribute("aria-hidden", "true");
            arrow.textContent = "↗";
            appointment.append(arrow);
            copy.append(eyebrow, title, price, description, specs, appointment);
            layout.append(image, copy);
            detail.replaceChildren(layout);
        })
        .catch((error) => window.Ainazik.setError(detail, error.message));
}
