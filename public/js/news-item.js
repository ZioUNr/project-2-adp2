const articleContainer = document.querySelector("#article-detail");
const articleId = new URLSearchParams(location.search).get("id");

if (!articleId) {
    window.Ainazik.message(articleContainer, "Публикация не найдена", "Вернитесь в новости, чтобы посмотреть другие заметки.");
} else {
    window.Ainazik.request(`/api/news/${encodeURIComponent(articleId)}`)
        .then((article) => {
            document.title = `${article.title} — AINAZIK`;
            const content = document.createElement("article");
            content.className = "article-copy";
            if (article.image) {
                const image = document.createElement("img");
                image.className = "article-cover";
                image.src = article.image;
                image.alt = "";
                content.append(image);
            }
            const date = document.createElement("time");
            date.className = "news-date";
            date.dateTime = article.created_at;
            date.textContent = window.Ainazik.formatDate(article.created_at);
            const title = document.createElement("h1");
            title.textContent = article.title;
            const excerpt = document.createElement("p");
            excerpt.className = "article-excerpt";
            excerpt.textContent = article.excerpt;
            const body = document.createElement("div");
            body.className = "article-body";
            body.textContent = article.body;
            const back = document.createElement("a");
            back.className = "text-link article-back";
            back.href = "/news.html";
            back.textContent = "← Все публикации";
            content.append(date, title, excerpt, body, back);
            articleContainer.replaceChildren(content);
        })
        .catch((error) => window.Ainazik.setError(articleContainer, error.message));
}
