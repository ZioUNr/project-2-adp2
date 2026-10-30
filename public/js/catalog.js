const catalogGrid = document.querySelector("#catalog-products");
const countLabel = document.querySelector("#catalog-count");
const filterButtons = [...document.querySelectorAll(".filter-button")];
let products = [];

const renderProducts = (category = "") => {
    const filtered = category ? products.filter((product) => product.category === category) : products;
    countLabel.textContent = `${filtered.length} ${filtered.length === 1 ? "образ" : "образов"}`;
    if (!filtered.length) {
        window.Ainazik.message(catalogGrid, category ? "В этой категории пока нет моделей" : "Каталог скоро пополнится", "Свяжитесь с салоном, чтобы узнать о коллекции и доступных моделях.");
        return;
    }
    catalogGrid.replaceChildren(...filtered.map(window.Ainazik.productCard));
};

window.Ainazik.request("/api/products")
    .then((items) => {
        products = items;
        renderProducts();
    })
    .catch((error) => {
        countLabel.textContent = "";
        window.Ainazik.setError(catalogGrid, error.message);
    });

filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
        filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
        renderProducts(button.dataset.category);
    });
});
