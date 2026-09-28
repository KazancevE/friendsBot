const money = (value, from) => `${from ? "от " : ""}${Number(value).toLocaleString("ru-RU")} ₽`;

const fill = (catalog) => {
  document.querySelector("#cashback").textContent = `${catalog.cashbackPercent}%`;
  const branches = new Map(catalog.branches.map((branch) => [branch.id, branch.name]));
  document.querySelector("#branch-list").innerHTML = catalog.branches
    .map(
      (branch) => `<article class="card"><h3>${branch.name}</h3><p>${branch.address}</p><p class="muted">Ежедневно ${branch.hours}</p><a class="btn" href="/app/?demo=1">Записаться</a></article>`,
    )
    .join("");
  document.querySelector("#master-list").innerHTML = catalog.masters
    .map(
      (master) =>
        `<article class="master"><div class="level">${master.levelLabel}</div><strong>${master.name}</strong><span>${master.branchName}${master.rating ? ` · ${master.rating} (${master.ratingCount})` : ""}</span></article>`,
    )
    .join("");
  const rows = [];
  for (const service of catalog.services) {
    for (const price of service.prices) {
      rows.push(
        `<tr><td>${service.name}</td><td>${price.levelLabel}</td><td>${branches.get(price.branchId) ?? ""}</td><td>${money(price.priceRub, price.priceFrom)}</td><td>${price.durationMinutes} мин</td></tr>`,
      );
    }
  }
  document.querySelector("#price-rows").innerHTML = rows.join("");
  if (catalog.links?.telegram) {
    const link = document.querySelector("#book-tg");
    link.href = catalog.links.telegram;
  }
  if (catalog.links?.max) {
    document.querySelector("#book-max").href = catalog.links.max;
  }
};

fetch("/api/salon/public")
  .then((response) => response.json())
  .then(fill)
  .catch(() => {
    document.querySelector("#branch-list").textContent = "Не удалось загрузить прайс. Проверьте, что база поднята и сид выполнен.";
  });
