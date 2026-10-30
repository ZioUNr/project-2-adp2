const featuredProducts = document.querySelector("#featured-products");
const latestNews = document.querySelector("#latest-news");

if (featuredProducts) {
    window.Ainazik.request("/api/products")
        .then((products) => {
            const latest = products.slice(0, 3);
            if (!latest.length) {
                window.Ainazik.message(featuredProducts, "Коллекция скоро появится", "Свяжитесь с салоном, и мы расскажем о доступных образах.");
                return;
            }
            featuredProducts.replaceChildren(...latest.map(window.Ainazik.productCard));
        })
        .catch((error) => window.Ainazik.setError(featuredProducts, error.message));
}

if (latestNews) {
    window.Ainazik.request("/api/news")
        .then((articles) => {
            const recent = articles.slice(0, 2);
            if (!recent.length) {
                window.Ainazik.message(latestNews, "Новости готовятся", "Новые публикации появятся здесь.");
                return;
            }
            latestNews.replaceChildren(...recent.map(window.Ainazik.newsCard));
        })
        .catch((error) => window.Ainazik.setError(latestNews, error.message));
}
