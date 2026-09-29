const money = (value, from) => `${from ? "от " : ""}${Number(value).toLocaleString("ru-RU")} ₽`;

const fill = (catalog) => {
  const cashback = document.querySelector("#cashback");
  if (cashback) cashback.textContent = `${catalog.cashbackPercent}%`;
  const count = document.querySelector("#branch-count");
  if (count) count.textContent = String(catalog.branches.length);
  const branches = new Map(catalog.branches.map((branch) => [branch.id, branch]));
  document.querySelector("#branch-list").innerHTML = catalog.branches
    .map((branch) => {
      const ext = branch.phoneExt ? `, доб. ${branch.phoneExt}` : "";
      const phone = branch.phone ? `<p class="muted">${branch.phone}${ext}</p>` : "";
      const note = branch.note ? `<p class="muted">${branch.note}</p>` : "";
      return `<article class="card"><h3>${branch.name}</h3><p>${branch.address}</p><p class="muted">Ежедневно ${branch.hours}</p>${phone}${note}<a class="btn" href="/app/?demo=1">Записаться</a></article>`;
    })
    .join("");
  document.querySelector("#master-list").innerHTML = catalog.masters
    .map((master) => {
      const title = master.name === master.levelLabel ? master.levelLabel : `${master.name} · ${master.levelLabel}`;
      return `<article class="master"><strong>${title}</strong><span>${master.branchName}</span></article>`;
    })
    .join("");
  const rows = [];
  for (const service of catalog.services) {
    if (!service.prices.length) continue;
    const price = service.prices[0];
    const offered = new Set(service.prices.map((item) => item.branchId));
    const missing = catalog.branches.filter((branch) => !offered.has(branch.id));
    const where = missing.length === 0 ? "все филиалы" : `кроме ${missing.map((branch) => branch.name).join(", ")}`;
    const same = service.prices.every((item) => item.priceRub === price.priceRub && item.durationMinutes === price.durationMinutes);
    rows.push(
      `<tr><td>${service.name}</td><td>${where}</td><td>${money(price.priceRub, !same || price.priceFrom)}</td><td>≈ ${price.durationMinutes} мин</td></tr>`,
    );
  }
  document.querySelector("#price-rows").innerHTML = rows.join("");
  if (catalog.links?.telegram) {
    document.querySelector("#book-tg").href = catalog.links.telegram;
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
