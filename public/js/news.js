const newsList = document.querySelector("#news-list");

window.Ainazik.request("/api/news")
    .then((articles) => {
        if (!articles.length) {
            window.Ainazik.message(newsList, "Публикации скоро появятся", "Новости салона, новые поступления и полезные советы будут публиковаться здесь.");
            return;
        }
        newsList.replaceChildren(...articles.map(window.Ainazik.newsCard));
    })
    .catch((error) => window.Ainazik.setError(newsList, error.message));
