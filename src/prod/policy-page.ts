export type OperatorDetails = {
  legalName: string;
  inn: string;
  address: string;
  policyVersion: string;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

export const operatorFromEnv = (env: Record<string, string | undefined> = process.env): OperatorDetails => ({
  legalName: env.OPERATOR_LEGAL_NAME?.trim() || "Оператор не указан",
  inn: env.OPERATOR_INN?.trim() || "—",
  address: env.OPERATOR_ADDRESS?.trim() || "адрес уточняется у администратора салона",
  policyVersion: env.POLICY_VERSION?.trim() || "2026-09-29",
});

const page = (title: string, body: string) => `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="/site/styles.css" />
</head>
<body>
  <div class="wrap">
    <p><a href="/">На главную</a></p>
    <h1>${title}</h1>
    ${body}
  </div>
</body>
</html>`;

export const privacyPolicyHtml = (operator: OperatorDetails) =>
  page(
    "Политика обработки персональных данных",
    `<p>Версия ${escapeHtml(operator.policyVersion)}.</p>
     <p>Оператор: ${escapeHtml(operator.legalName)}, ИНН ${escapeHtml(operator.inn)}, ${escapeHtml(operator.address)}.</p>
     <p>Оператор обрабатывает имя, телефон, дату рождения, историю записей и бонусов, идентификаторы Telegram и MAX — чтобы вести запись к мастеру и бонусную карту.</p>
     <p>Основание — согласие субъекта. Данные хранятся на сервере оператора, пока клиент пользуется картой или пока не попросит удалить их.</p>
     <p>Клиент может запросить выгрузку или удаление персональных данных у администратора салона. После удаления в карточке остаётся обезличенная запись без имени, телефона и даты рождения.</p>
     <p>Версия документа указана выше. Новая версия запрашивает согласие заново, если оператор её сменит в настройках.</p>`,
  );

export const consentPageHtml = (operator: OperatorDetails) =>
  page(
    "Согласие на обработку персональных данных",
    `<p>Версия ${escapeHtml(operator.policyVersion)}. Оператор: ${escapeHtml(operator.legalName)}, ИНН ${escapeHtml(operator.inn)}.</p>
     <p>Нажимая «Согласен» в боте Telegram или MAX, клиент разрешает обработку имени, телефона, даты рождения, записей и бонусов для записи в барбершоп и работы бонусной карты.</p>
     <p>Согласие можно отозвать, попросив администратора удалить данные. Текст политики: <a href="/privacy">/privacy</a>.</p>`,
  );
