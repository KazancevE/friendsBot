import type { UserRecord } from "../domain/types.ts";
import { formatAppointmentWhen, formatMinutes, formatPrice } from "./format.ts";
import type { InboundMessage, OutMessage } from "./outbound.ts";
import { SalonService, type SlotOffer } from "./service.ts";

type Draft = {
  branchId?: string;
  serviceId?: string;
  barberId?: string;
  date?: string;
  page?: number;
  offers?: SlotOffer[];
};

const PAGE = 6;

const chunk = <T>(items: T[], size: number) => {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
};

export class SalonFlow {
  constructor(private readonly salon: SalonService) {}

  async handle(inbound: InboundMessage): Promise<{ userId: string; messages: OutMessage[]; notice?: string }> {
    const user = await this.salon.ensureChannelUser({
      channel: inbound.channel,
      externalId: inbound.externalId,
      firstName: inbound.firstName,
      startPayload: inbound.startPayload,
    });
    const dialog = await this.salon.getDialog(inbound.channel, inbound.externalId);
    let step = dialog?.step ?? "menu";
    let draft = (dialog?.payload ?? {}) as Draft;
    const data = inbound.callback ?? inbound.text?.trim() ?? inbound.startPayload ?? "";

    if (data === "nav:menu" || data === "/start" || inbound.startPayload !== undefined && !inbound.callback && !inbound.text) {
      step = "menu";
    }
    if (data === "nav:book" || data === "Записаться") {
      if (!this.salon.profileReady(user)) {
        return this.askName(user, inbound, draft);
      }
      return this.showBranches(user, inbound, {});
    }
    if (data === "nav:my" || data === "Мои записи") {
      return this.showMine(user, inbound, draft, step);
    }
    if (data === "nav:bonus" || data === "Бонусы") {
      return this.showBonus(user, inbound, draft, step);
    }
    if (data === "nav:ref" || data === "Пригласить друга") {
      return this.showReferral(user, inbound, draft, step);
    }
    if (data.startsWith("cx:")) {
      return this.cancelOne(user, inbound, data.slice(3), draft, step);
    }
    if (data.startsWith("rm:")) {
      const messages = [this.menuMessage(user, "Ждём вас. Если планы изменятся — отмените запись в «Мои записи».")];
      await this.persist(inbound, user.id, "menu", draft);
      return { userId: user.id, messages };
    }

    if (step === "reg_name") {
      return this.takeName(user, inbound, inbound.text ?? "");
    }
    if (step === "reg_phone") {
      return this.takePhone(user, inbound, inbound.phone ?? inbound.text ?? "");
    }
    if (step === "reg_birthday") {
      if (data === "bd:skip") {
        return this.finishProfile(user, inbound);
      }
      return this.takeBirthday(user, inbound, inbound.text ?? "");
    }
    if (data.startsWith("br:")) {
      draft = { branchId: data.slice(3), page: 0 };
      return this.showServices(user, inbound, draft);
    }
    if (data.startsWith("pg:sv:")) {
      draft = { ...draft, page: Number(data.slice(6)) || 0 };
      return this.showServices(user, inbound, draft);
    }
    if (data.startsWith("sv:")) {
      draft = { ...draft, serviceId: data.slice(3), page: 0 };
      return this.showMasters(user, inbound, draft);
    }
    if (data.startsWith("ms:")) {
      draft = { ...draft, barberId: data.slice(3), page: 0 };
      return this.showDates(user, inbound, draft);
    }
    if (data.startsWith("pg:dt:")) {
      draft = { ...draft, page: Number(data.slice(6)) || 0 };
      return this.showDates(user, inbound, draft);
    }
    if (data.startsWith("dt:")) {
      draft = { ...draft, date: data.slice(3), page: 0 };
      return this.showTimes(user, inbound, draft);
    }
    if (data.startsWith("pg:tm:")) {
      draft = { ...draft, page: Number(data.slice(6)) || 0 };
      return this.showTimes(user, inbound, draft);
    }
    if (data.startsWith("tm:")) {
      const startMin = Number(data.slice(3));
      const offer = (draft.offers ?? []).find((row) => row.startMin === startMin);
      if (!offer || !draft.branchId || !draft.serviceId || !draft.date) {
        return this.showBranches(user, inbound, {});
      }
      draft = { ...draft, barberId: offer.barberId, offers: [offer] };
      const text = [
        "Проверьте запись:",
        `${offer.barberName} · ${formatMinutes(offer.startMin)}`,
        this.salon.dayLabel(draft.date),
        formatPrice(offer.priceRub, offer.priceFrom),
      ].join("\n");
      const messages = [
        {
          text,
          buttons: [
            [{ text: "Подтвердить", callback: "go:yes" }],
            [{ text: "Другое время", callback: `dt:${draft.date}` }, { text: "В меню", callback: "nav:menu" }],
          ],
        },
      ];
      await this.persist(inbound, user.id, "book_confirm", { ...draft, startMin });
      return { userId: user.id, messages };
    }
    if (data === "go:yes") {
      return this.confirm(user, inbound, draft as Draft & { startMin?: number });
    }

    const messages = [await this.home(user)];
    await this.persist(inbound, user.id, "menu", {});
    return { userId: user.id, messages };
  }

  private async home(user: UserRecord): Promise<OutMessage> {
    const settingsCard = await this.salon.card(user.id);
    const next = settingsCard.appointments[0];
    const lines = [
      "Daddyson Barbershop",
      "Бийск · два филиала · одна бонусная карта",
      "",
      `${user.firstName ?? "Гость"}, на карте ${settingsCard.balance} ₽ · кэшбэк ${settingsCard.cashbackPercent}%`,
    ];
    if (next) {
      lines.push(`Ближайшая запись: ${next.when}, ${next.service}, ${next.barber}`);
    }
    return this.menuMessage(user, lines.join("\n"));
  }

  private menuMessage(user: UserRecord, text: string): OutMessage {
    const app = user.id ? "" : "";
    void app;
    return {
      text,
      removeKeyboard: true,
      buttons: [
        [
          { text: "Записаться", callback: "nav:book" },
          { text: "Мои записи", callback: "nav:my" },
        ],
        [
          { text: "Бонусы", callback: "nav:bonus" },
          { text: "Пригласить друга", callback: "nav:ref" },
        ],
      ],
    };
  }

  private async askName(user: UserRecord, inbound: InboundMessage, draft: Draft) {
    const messages: OutMessage[] = [
      {
        text: "Как к вам обращаться? Напишите имя и, если хотите, фамилию.",
        removeKeyboard: true,
      },
    ];
    await this.persist(inbound, user.id, "reg_name", draft);
    return { userId: user.id, messages };
  }

  private async takeName(user: UserRecord, inbound: InboundMessage, text: string) {
    try {
      const named = await this.salon.saveName(user.id, text);
      const messages: OutMessage[] = [
        {
          text: `${named.firstName}, пришлите телефон кнопкой ниже — так мы свяжем Telegram и MAX в одну карту.`,
          requestContact: true,
        },
      ];
      await this.persist(inbound, named.id, "reg_phone", {});
      return { userId: named.id, messages };
    } catch (error) {
      const messages: OutMessage[] = [{ text: error instanceof Error ? error.message : "Не получилось сохранить имя" }];
      await this.persist(inbound, user.id, "reg_name", {});
      return { userId: user.id, messages };
    }
  }

  private async takePhone(user: UserRecord, inbound: InboundMessage, raw: string) {
    try {
      const saved = await this.salon.savePhone(user.id, raw, inbound.channel);
      const messages: OutMessage[] = [
        {
          text: "День рождения? Начислим бонус в этот день. Формат ДД.ММ.ГГГГ или нажмите «Пропустить».",
          removeKeyboard: true,
          buttons: [[{ text: "Пропустить", callback: "bd:skip" }]],
        },
      ];
      await this.persist(inbound, saved.id, "reg_birthday", {});
      return { userId: saved.id, messages };
    } catch (error) {
      const messages: OutMessage[] = [
        {
          text: error instanceof Error ? error.message : "Некорректный телефон",
          requestContact: true,
        },
      ];
      await this.persist(inbound, user.id, "reg_phone", {});
      return { userId: user.id, messages };
    }
  }

  private async takeBirthday(user: UserRecord, inbound: InboundMessage, text: string) {
    try {
      const saved = await this.salon.saveBirthday(user.id, text);
      return this.finishProfile(saved, inbound);
    } catch (error) {
      const messages: OutMessage[] = [
        {
          text: error instanceof Error ? error.message : "Некорректная дата",
          buttons: [[{ text: "Пропустить", callback: "bd:skip" }]],
        },
      ];
      await this.persist(inbound, user.id, "reg_birthday", {});
      return { userId: user.id, messages };
    }
  }

  private async finishProfile(user: UserRecord, inbound: InboundMessage) {
    const fresh = (await this.salon.card(user.id)) ? user : user;
    void fresh;
    const messages = [await this.home(user)];
    messages[0] = {
      ...messages[0]!,
      text: `Карта готова. Кэшбэк копится на обоих филиалах.\n\n${messages[0]!.text}`,
    };
    await this.persist(inbound, user.id, "menu", {});
    return { userId: user.id, messages };
  }

  private async showBranches(user: UserRecord, inbound: InboundMessage, draft: Draft) {
    const branches = await this.salon.branches();
    const messages: OutMessage[] = [
      {
        text: "Выберите филиал",
        buttons: [
          ...branches.map((branch) => [{ text: branch.name, callback: `br:${branch.id}` }]),
          [{ text: "В меню", callback: "nav:menu" }],
        ],
      },
    ];
    await this.persist(inbound, user.id, "book_branch", draft);
    return { userId: user.id, messages };
  }

  private async showServices(user: UserRecord, inbound: InboundMessage, draft: Draft) {
    if (!draft.branchId) {
      return this.showBranches(user, inbound, {});
    }
    const services = await this.salon.servicesForBranch(draft.branchId);
    const page = draft.page ?? 0;
    const slice = services.slice(page * PAGE, page * PAGE + PAGE);
    const buttons = slice.map((service) => [
      {
        text: `${service.name} · ${formatPrice(service.minPrice, service.from)}`,
        callback: `sv:${service.id}`,
      },
    ]);
    const nav: OutMessage["buttons"] = [];
    const pager: { text: string; callback: string }[] = [];
    if (page > 0) {
      pager.push({ text: "←", callback: `pg:sv:${page - 1}` });
    }
    if ((page + 1) * PAGE < services.length) {
      pager.push({ text: "→", callback: `pg:sv:${page + 1}` });
    }
    if (pager.length > 0) {
      nav.push(pager);
    }
    const messages: OutMessage[] = [
      {
        text: "Выберите услугу",
        buttons: [...buttons, ...nav, [{ text: "Филиал", callback: "nav:book" }]],
      },
    ];
    await this.persist(inbound, user.id, "book_service", draft);
    return { userId: user.id, messages };
  }

  private async showMasters(user: UserRecord, inbound: InboundMessage, draft: Draft) {
    if (!draft.branchId || !draft.serviceId) {
      return this.showBranches(user, inbound, {});
    }
    const masters = await this.salon.barbersForService(draft.branchId, draft.serviceId);
    const buttons = [
      [{ text: "Любой мастер", callback: "ms:any" }],
      ...masters.map((master) => [
        {
          text: `${master.name} · ${master.levelLabel} · ${formatPrice(master.priceRub, master.priceFrom)}`,
          callback: `ms:${master.id}`,
        },
      ]),
      [{ text: "В меню", callback: "nav:menu" }],
    ];
    const messages: OutMessage[] = [{ text: "Выберите мастера", buttons }];
    await this.persist(inbound, user.id, "book_master", draft);
    return { userId: user.id, messages };
  }

  private async showDates(user: UserRecord, inbound: InboundMessage, draft: Draft) {
    const dates = this.salon.upcomingDates();
    const page = draft.page ?? 0;
    const slice = dates.slice(page * 7, page * 7 + 7);
    const buttons = chunk(
      slice.map((date) => ({ text: this.salon.dayLabel(date), callback: `dt:${date}` })),
      2,
    );
    const pager: { text: string; callback: string }[] = [];
    if (page > 0) {
      pager.push({ text: "←", callback: `pg:dt:${page - 1}` });
    }
    if ((page + 1) * 7 < dates.length) {
      pager.push({ text: "→", callback: `pg:dt:${page + 1}` });
    }
    const messages: OutMessage[] = [
      {
        text: "Выберите день",
        buttons: [...buttons, ...(pager.length ? [pager] : []), [{ text: "В меню", callback: "nav:menu" }]],
      },
    ];
    await this.persist(inbound, user.id, "book_date", draft);
    return { userId: user.id, messages };
  }

  private async showTimes(user: UserRecord, inbound: InboundMessage, draft: Draft) {
    if (!draft.branchId || !draft.serviceId || !draft.barberId || !draft.date) {
      return this.showBranches(user, inbound, {});
    }
    const offers = await this.salon.listSlots({
      branchId: draft.branchId,
      serviceId: draft.serviceId,
      barberId: draft.barberId,
      date: draft.date,
    });
    const page = draft.page ?? 0;
    const slice = offers.slice(page * 8, page * 8 + 8);
    if (offers.length === 0) {
      const messages: OutMessage[] = [
        {
          text: "В этот день свободных окон нет. Выберите другую дату.",
          buttons: [[{ text: "Другой день", callback: `ms:${draft.barberId}` }]],
        },
      ];
      await this.persist(inbound, user.id, "book_time", { ...draft, offers: [] });
      return { userId: user.id, messages };
    }
    const buttons = chunk(
      slice.map((offer) => ({ text: formatMinutes(offer.startMin), callback: `tm:${offer.startMin}` })),
      3,
    );
    const pager: { text: string; callback: string }[] = [];
    if (page > 0) {
      pager.push({ text: "←", callback: `pg:tm:${page - 1}` });
    }
    if ((page + 1) * 8 < offers.length) {
      pager.push({ text: "→", callback: `pg:tm:${page + 1}` });
    }
    const messages: OutMessage[] = [
      {
        text: "Свободное время",
        buttons: [...buttons, ...(pager.length ? [pager] : []), [{ text: "Другой день", callback: `ms:${draft.barberId}` }]],
      },
    ];
    await this.persist(inbound, user.id, "book_time", { ...draft, offers });
    return { userId: user.id, messages };
  }

  private async confirm(user: UserRecord, inbound: InboundMessage, draft: Draft & { startMin?: number }) {
    const offer = draft.offers?.[0];
    if (!draft.branchId || !draft.serviceId || !draft.date || !offer || draft.startMin === undefined) {
      return this.showBranches(user, inbound, {});
    }
    try {
      const booked = await this.salon.book({
        userId: user.id,
        branchId: draft.branchId,
        serviceId: draft.serviceId,
        barberId: offer.barberId,
        date: draft.date,
        startMin: draft.startMin,
      });
      const when = formatAppointmentWhen(booked.appointment.startsAt);
      const messages = [
        this.menuMessage(
          user,
          `Вы записаны: ${when}, ${booked.appointment.service.name}, ${booked.appointment.barber.name}, ${booked.appointment.branch.name}.`,
        ),
      ];
      await this.persist(inbound, user.id, "menu", {});
      return { userId: user.id, messages, notice: booked.notice };
    } catch (error) {
      const messages: OutMessage[] = [
        {
          text: error instanceof Error ? error.message : "Не удалось записать",
          buttons: [[{ text: "Выбрать время", callback: `dt:${draft.date}` }]],
        },
      ];
      await this.persist(inbound, user.id, "book_time", draft);
      return { userId: user.id, messages };
    }
  }

  private async showMine(user: UserRecord, inbound: InboundMessage, draft: Draft, step: string) {
    const rows = await this.salon.myAppointments(user.id);
    const text =
      rows.length === 0
        ? "Активных записей нет."
        : rows
            .map(
              (row) =>
                `${formatAppointmentWhen(row.startsAt)} · ${row.service.name} · ${row.barber.name} · ${row.branch.name}`,
            )
            .join("\n");
    const buttons = rows.map((row) => [
      { text: `Отменить ${formatAppointmentWhen(row.startsAt)}`, callback: `cx:${row.id}` },
    ]);
    const messages: OutMessage[] = [
      { text, buttons: [...buttons, [{ text: "Записаться", callback: "nav:book" }, { text: "В меню", callback: "nav:menu" }]] },
    ];
    await this.persist(inbound, user.id, step, draft);
    return { userId: user.id, messages };
  }

  private async cancelOne(user: UserRecord, inbound: InboundMessage, id: string, draft: Draft, step: string) {
    try {
      const cancelled = await this.salon.cancel(user.id, id);
      const messages = [this.menuMessage(user, "Запись отменена.")];
      await this.persist(inbound, user.id, "menu", {});
      return { userId: user.id, messages, notice: cancelled.notice };
    } catch (error) {
      const messages: OutMessage[] = [
        { text: error instanceof Error ? error.message : "Не удалось отменить", buttons: [[{ text: "В меню", callback: "nav:menu" }]] },
      ];
      await this.persist(inbound, user.id, step, draft);
      return { userId: user.id, messages };
    }
  }

  private async showBonus(user: UserRecord, inbound: InboundMessage, draft: Draft, step: string) {
    const card = await this.salon.card(user.id);
    const messages: OutMessage[] = [
      {
        text: `На карте ${card.balance} ₽. Кэшбэк ${card.cashbackPercent}% с визита — общий для обоих филиалов. На кассе покажите QR в мини-приложении.`,
        buttons: [[{ text: "В меню", callback: "nav:menu" }]],
      },
    ];
    await this.persist(inbound, user.id, step, draft);
    return { userId: user.id, messages };
  }

  private async showReferral(user: UserRecord, inbound: InboundMessage, draft: Draft, step: string) {
    const card = await this.salon.card(user.id);
    const messages: OutMessage[] = [
      {
        text: `Пригласите друга: обоим по ${card.referralBonus} ₽ после его первого визита.\n${card.referralLink}`,
        buttons: [[{ text: "В меню", callback: "nav:menu" }]],
      },
    ];
    await this.persist(inbound, user.id, step, draft);
    return { userId: user.id, messages };
  }

  private async persist(inbound: InboundMessage, userId: string, step: string, payload: Draft) {
    await this.salon.saveDialog({
      channel: inbound.channel,
      externalId: inbound.externalId,
      userId,
      step,
      payload: payload as Record<string, unknown>,
    });
  }
}
