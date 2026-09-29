/**
 * Конфиг салона для демо BRO.
 * Следующее демо: поправьте этот файл, тексты лендинга в site/index.html и цвета в CSS.
 * Цены и филиалы сид читает отсюда, бот — тексты copy.
 *
 * Длительности услуг в открытых источниках нет (YCLIENTS был недоступен).
 * Ниже оценочные минуты: обычные услуги 30–60, комплексы и «Отец + сын» дольше.
 * Сумма бонуса на день рождения в источниках не указана: в демо 500 ₽, меняется в админке.
 * Цены по уровням мастеров не разводим: в прайсе одна цена, уровни — только подпись карточки.
 */

export type VenueLevel = "barber" | "senior" | "chef";

export type VenueBranch = {
  slug: string;
  name: string;
  address: string;
  city: string;
  phoneExt: string;
  sort: number;
  note: string;
};

export type VenueService = {
  name: string;
  category: string;
  priceRub: number;
  durationMinutes: number;
  branches: string[];
};

export type VenueMaster = {
  branch: string;
  name: string;
  level: VenueLevel;
  sort: number;
};

const allBranches = ["lenina126", "brestskaya18", "lazurnaya19", "semyonova14"];
const withoutLazurnaya = ["lenina126", "brestskaya18", "semyonova14"];

export const venue = {
  id: "bro",
  brandName: "BRO",
  city: "Барнаул",
  cityCaps: "БАРНАУЛ",
  tagline: "Где приходят к мастеру, а не в парикмахерскую",
  tagline2: "Твой стиль — наша работа",
  founded: "апрель 2017",
  hoursLabel: "10:00–21:00",
  openMin: 600,
  closeMin: 1260,
  timezone: "Asia/Barnaul",
  accent: "#F0B820",
  contacts: {
    phone: "+7 (3852) 99-44-99",
    whatsapp: "+7 960 954-25-22",
    whatsappUrl: "https://wa.me/79609542522",
    email: "barnaulbro@yandex.ru",
    vk: "https://vk.com/bro.barnaul",
    telegramAdmin: "https://t.me/brobarnaul_admin",
  },
  loyalty: {
    cashbackPercent: 5,
    referralReferrer: 300,
    referralReferee: 300,
    birthdayBonus: 500,
    haircutNudgeWeeks: 4,
    reminderLeadHours: [24, 2] as const,
    importWelcomeBonus: 0,
  },
  levelLabels: {
    junior: "Мастер",
    barber: "Мастер",
    senior: "Топ-мастер",
    chef: "Амбассадор",
  },
  facts: [
    "2ГИС: Ленина 5.0 (522 оценки), Лазурная 5.0 (428), Семёнова 4.9 (326)",
    "Лучший барбершоп 2026, Премия 2ГИС — филиал на Ленина",
    "Хорошее место 2026 от Яндекса — Ленина, Лазурная и Семёнова",
    "Работают с апреля 2017",
  ],
  copy: {
    greeting:
      "Привет! Это BRO — мужская парикмахерская в Барнауле.\nЗаписывайся, бро: к мастеру, а не в парикмахерскую. Здесь же карта и бонусы. Сначала согласие, телефон и имя. День рождения можно пропустить.",
    homeTitle: "BRO",
    homeSubtitle: "Барнаул · четыре филиала · одна бонусная карта",
    cardReady: "Карта готова. Кэшбэк копится на всех филиалах.",
    phoneAsk:
      "Отправь номер кнопкой «Отправить телефон». Если в базе уже есть карта на этот номер, привяжем её сюда.",
    nameAskKnown: "Как к тебе обращаться? В профиле указано: {name}. Напиши другое имя или оставь это.",
    nameAsk: "Как к тебе обращаться? Напиши имя и, если хочешь, фамилию.",
    birthdayAsk:
      "День рождения указывать не обязательно. Если укажешь, в этот день начислим бонус на карту. Формат ДД.ММ.ГГГГ.",
    nudge: "Пора стричься, бро — с прошлого визита прошло около {weeks} недель. Записывайся в BRO.",
    birthdaySoon: "Скоро день рождения — в BRO для тебя бонус на карте.",
    birthdayToday: "С днём рождения! Бонус уже на карте BRO.",
    alertPrefix: "BRO",
    contactsBody:
      "BRO, Барнаул. Четыре филиала, ежедневно 10:00–21:00. Телефон +7 (3852) 99-44-99. Запись в боте и в карте гостя.",
  },
  examplePromo:
    "Пример акции, к записи и чеку не применяется. В карточках Яндекса у всех филиалов BRO указано: −20% на первый визит. Когда акцию включат по-настоящему, условие задаётся отдельно — эта карточка только показывает, как она выглядит в админке.",
  branches: [
    {
      slug: "lenina126",
      name: "Ленина 126",
      address: "Барнаул, проспект Ленина, 126, 1 этаж",
      city: "Барнаул",
      phoneExt: "2",
      sort: 1,
      note: "2ГИС 5.0 · 522 оценки. Лучший барбершоп 2026, Премия 2ГИС. Хорошее место 2026, Яндекс.",
    },
    {
      slug: "brestskaya18",
      name: "Брестская 18",
      address: "Барнаул, улица Брестская, 18, 1 этаж",
      city: "Барнаул",
      phoneExt: "1",
      sort: 2,
      note: "",
    },
    {
      slug: "lazurnaya19",
      name: "Лазурная 19",
      address: "Барнаул, улица Лазурная, 19, 1 этаж",
      city: "Барнаул",
      phoneExt: "3",
      sort: 3,
      note: "2ГИС 5.0 · 428 оценок. Хорошее место 2026, Яндекс.",
    },
    {
      slug: "semyonova14",
      name: "Семёнова 14",
      address: "Барнаул, улица Сергея Семёнова, 14, ЖК «Дружный 3», 1 этаж",
      city: "Барнаул",
      phoneExt: "4",
      sort: 4,
      note: "2ГИС 4.9 · 326 оценок. Хорошее место 2026, Яндекс.",
    },
  ] satisfies VenueBranch[],
  services: [
    { name: "Патчи под глаза", category: "Доп. услуги", priceRub: 200, durationMinutes: 30, branches: allBranches },
    { name: "Тонирование бороды", category: "Доп. услуги", priceRub: 1300, durationMinutes: 40, branches: allBranches },
    { name: "Тонирование головы", category: "Доп. услуги", priceRub: 2000, durationMinutes: 50, branches: allBranches },
    { name: "Удаление волос воском", category: "Доп. услуги", priceRub: 500, durationMinutes: 30, branches: allBranches },
    { name: "Укладка и окантовка", category: "Доп. услуги", priceRub: 800, durationMinutes: 30, branches: allBranches },
    { name: "Всё включено", category: "Комплексы", priceRub: 6300, durationMinutes: 150, branches: allBranches },
    { name: "Стрижка + Королевское бритьё", category: "Комплексы", priceRub: 3000, durationMinutes: 90, branches: withoutLazurnaya },
    { name: "Стрижка + Оформление бороды", category: "Комплексы", priceRub: 2800, durationMinutes: 80, branches: allBranches },
    { name: "Стрижка + Оформление и тонирование бороды", category: "Комплексы", priceRub: 4000, durationMinutes: 100, branches: allBranches },
    { name: "Детская стрижка (от 4 до 10 лет)", category: "Основные услуги", priceRub: 1500, durationMinutes: 40, branches: allBranches },
    { name: "Королевское бритьё", category: "Основные услуги", priceRub: 1600, durationMinutes: 45, branches: withoutLazurnaya },
    { name: "Мужская стрижка", category: "Основные услуги", priceRub: 1800, durationMinutes: 50, branches: allBranches },
    { name: "Отец + Сын (от 4 до 10 лет)", category: "Основные услуги", priceRub: 2800, durationMinutes: 90, branches: allBranches },
    { name: "Оформление бороды", category: "Основные услуги", priceRub: 1300, durationMinutes: 40, branches: allBranches },
    { name: "Стрижка под насадку", category: "Основные услуги", priceRub: 1000, durationMinutes: 30, branches: allBranches },
  ] satisfies VenueService[],
  masters: [
    { branch: "lenina126", name: "Мастер", level: "barber", sort: 1 },
    { branch: "lenina126", name: "Топ-мастер", level: "senior", sort: 2 },
    { branch: "lenina126", name: "Амбассадор", level: "chef", sort: 3 },
    { branch: "brestskaya18", name: "Мастер", level: "barber", sort: 1 },
    { branch: "brestskaya18", name: "Топ-мастер", level: "senior", sort: 2 },
    { branch: "lazurnaya19", name: "Мастер", level: "barber", sort: 1 },
    { branch: "lazurnaya19", name: "Топ-мастер", level: "senior", sort: 2 },
    { branch: "lazurnaya19", name: "Амбассадор", level: "chef", sort: 3 },
    { branch: "semyonova14", name: "Мастер", level: "barber", sort: 1 },
    { branch: "semyonova14", name: "Топ-мастер", level: "senior", sort: 2 },
    { branch: "semyonova14", name: "Амбассадор", level: "chef", sort: 3 },
  ] satisfies VenueMaster[],
};

export const publicBrand = () => ({
  name: venue.brandName,
  city: venue.city,
  tagline: venue.tagline,
  tagline2: venue.tagline2,
  founded: venue.founded,
  hours: venue.hoursLabel,
  phone: venue.contacts.phone,
  whatsapp: venue.contacts.whatsapp,
  whatsappUrl: venue.contacts.whatsappUrl,
  vk: venue.contacts.vk,
  email: venue.contacts.email,
  facts: venue.facts,
  logo: "/site/logo.png",
  branchCount: venue.branches.length,
});
