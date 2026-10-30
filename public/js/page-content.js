const contentSection = document.querySelector("#page-content");

if (contentSection) {
    const page = contentSection.dataset.page;
    window.Ainazik.request(`/api/page-content/${encodeURIComponent(page)}`)
        .then((sections) => {
            if (!sections.length) {
                contentSection.hidden = true;
                return;
            }

            const container = document.createElement("div");
            container.className = "container page-content-list";
            sections.forEach((section) => {
                const block = document.createElement("article");
                block.className = "page-content-block";
                if (section.title) {
                    const title = document.createElement("h2");
                    title.textContent = section.title;
                    block.append(title);
                }
                const body = document.createElement("p");
                body.textContent = section.body;
                block.append(body);
                container.append(block);
            });
            contentSection.replaceChildren(container);
            contentSection.hidden = false;
        })
        .catch((error) => {
            const container = document.createElement("div");
            container.className = "container page-content-error";
            const message = document.createElement("p");
            message.textContent = error.message;
            container.append(message);
            contentSection.replaceChildren(container);
            contentSection.hidden = false;
        });
}
