import type { UserRecord } from "../domain/types.ts";
import { venue } from "../venue/salon.ts";
import { masterChoiceLabel } from "./catalog.ts";
import { formatAppointmentWhen, formatMinutes, formatPrice } from "./format.ts";
import type { InboundMessage, OutMessage } from "./outbound.ts";
import type { OnboardingStep } from "./onboarding.ts";
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
    const gate = await this.salon.onboardingView(user.id);
    if (gate.step !== "ready") {
      return this.onboard(user, inbound);
    }
    const dialog = await this.salon.getDialog(inbound.channel, inbound.externalId);
    let step = dialog?.step ?? "menu";
    let draft = (dialog?.payload ?? {}) as Draft;
    const data = inbound.callback ?? inbound.text?.trim() ?? inbound.startPayload ?? "";

    if (data === "nav:menu" || data === "/start" || inbound.startPayload !== undefined && !inbound.callback && !inbound.text) {
      step = "menu";
    }
    if (data === "nav:book" || data === "Записаться") {
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
      const messages = [this.menuMessage(user, "Ждём тебя. Если планы изменятся — отмени запись в «Мои записи».")];
      await this.persist(inbound, user.id, "menu", draft);
      return { userId: user.id, messages };
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
        "Проверь запись:",
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
      venue.copy.homeTitle,
      venue.copy.homeSubtitle,
      "",
      `${user.firstName ?? "Гость"}, на карте ${settingsCard.balance} ₽ · кэшбэк ${settingsCard.cashbackPercent}%`,
    ];
    if (next) {
      lines.push(`Ближайшая запись: ${next.when}, ${next.service}, ${next.barber}`);
    }
    return this.menuMessage(user, lines.join("\n"));
  }

  private menuMessage(_user: UserRecord, text: string): OutMessage {
    return {
      text,
      removeKeyboard: true,
      buttons: [
        [{ text: "Карта", webApp: this.salon.miniAppLink() }],
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

  private async onboard(initial: UserRecord, inbound: InboundMessage) {
    let user = initial;
    let note = "";
    let intro = false;
    let current = inbound;
    for (let guard = 0; guard < 8; guard += 1) {
      const view = await this.salon.onboardingView(user.id);
      if (view.step === "ready") {
        return this.finishProfile(user, inbound, intro, note);
      }
      const advanced = await this.tryAdvance(user, current, view.step);
      if (advanced.kind === "messages") {
        return advanced.result;
      }
      if (advanced.kind === "next") {
        if (view.step === "phone" || view.step === "name" || view.step === "birthday") {
          intro = true;
        }
        note = advanced.note || note;
        user = advanced.user;
        current = { channel: inbound.channel, externalId: inbound.externalId };
        continue;
      }
      return this.prompt(user, inbound, view.step, view.renew, view.promoRenew, note);
    }
    const view = await this.salon.onboardingView(user.id);
    return this.prompt(user, inbound, view.step, view.renew, view.promoRenew, note);
  }

  private async tryAdvance(
    user: UserRecord,
    inbound: InboundMessage,
    step: OnboardingStep,
  ): Promise<
    | { kind: "next"; user: UserRecord; note: string }
    | { kind: "messages"; result: { userId: string; messages: OutMessage[] } }
    | { kind: "none" }
  > {
    const callback = inbound.callback ?? "";
    if (step === "consent") {
      if (callback === "pd:yes") {
        await this.salon.recordConsent(user.id);
        return { kind: "next", user, note: "" };
      }
      if (callback === "pd:no") {
        return { kind: "messages", result: await this.consentMessages(user, inbound, "refuse") };
      }
      return { kind: "none" };
    }
    if (step === "promo") {
      if (callback === "pr:yes" || callback === "pr:no") {
        await this.salon.recordPromoConsent(user.id, callback === "pr:yes");
        return { kind: "next", user, note: "" };
      }
      return { kind: "none" };
    }
    if (step === "phone") {
      const raw = !callback && inbound.text !== "/start" ? inbound.phone ?? inbound.text?.trim() ?? "" : "";
      if (!raw) {
        return { kind: "none" };
      }
      try {
        const saved = await this.salon.savePhone(user.id, raw, inbound.channel);
        const linked = await this.salon.phoneLinksImport(saved.id);
        return {
          kind: "next",
          user: saved,
          note: linked ? "Нашли карту по этому номеру, бонусы на месте." : "",
        };
      } catch (error) {
        const messages: OutMessage[] = [
          {
            text: error instanceof Error ? error.message : "Некорректный телефон",
            requestContact: true,
          },
        ];
        await this.persist(inbound, user.id, "reg_phone", {});
        return { kind: "messages", result: { userId: user.id, messages } };
      }
    }
    if (step === "name") {
      if (callback === "nm:keep") {
        try {
          const kept = await this.salon.confirmKeptName(user.id);
          return { kind: "next", user: kept, note: "" };
        } catch (error) {
          const messages: OutMessage[] = [{ text: error instanceof Error ? error.message : "Напишите имя" }];
          await this.persist(inbound, user.id, "reg_name", {});
          return { kind: "messages", result: { userId: user.id, messages } };
        }
      }
      const text = !callback && inbound.text && inbound.text !== "/start" ? inbound.text : "";
      if (!text) {
        return { kind: "none" };
      }
      try {
        const named = await this.salon.saveName(user.id, text);
        return { kind: "next", user: named, note: "" };
      } catch (error) {
        const messages: OutMessage[] = [{ text: error instanceof Error ? error.message : "Не получилось сохранить имя" }];
        await this.persist(inbound, user.id, "reg_name", {});
        return { kind: "messages", result: { userId: user.id, messages } };
      }
    }
    if (step === "birthday") {
      if (callback === "bd:skip") {
        const saved = await this.salon.skipBirthday(user.id);
        return { kind: "next", user: saved, note: "" };
      }
      const text = !callback && inbound.text && inbound.text !== "/start" ? inbound.text : "";
      if (!text) {
        return { kind: "none" };
      }
      try {
        const saved = await this.salon.saveBirthday(user.id, text);
        return { kind: "next", user: saved, note: "" };
      } catch (error) {
        const messages: OutMessage[] = [
          {
            text: error instanceof Error ? error.message : "Некорректная дата",
            buttons: [[{ text: "Пропустить", callback: "bd:skip" }]],
          },
        ];
        await this.persist(inbound, user.id, "reg_birthday", {});
        return { kind: "messages", result: { userId: user.id, messages } };
      }
    }
    return { kind: "none" };
  }

  private async prompt(
    user: UserRecord,
    inbound: InboundMessage,
    step: OnboardingStep,
    renew: boolean,
    promoRenew: boolean,
    note: string,
  ) {
    if (step === "consent") {
      return this.consentMessages(user, inbound, renew ? "renew" : "ask");
    }
    if (step === "promo") {
      return this.promoMessages(user, inbound, promoRenew);
    }
    if (step === "phone") {
      const messages: OutMessage[] = [
        {
          text: venue.copy.phoneAsk,
          requestContact: true,
        },
      ];
      await this.persist(inbound, user.id, "reg_phone", {});
      return { userId: user.id, messages };
    }
    if (step === "name") {
      return this.nameMessages(user, inbound, note);
    }
    if (step === "birthday") {
      const messages: OutMessage[] = [
        {
          text: [note, venue.copy.birthdayAsk]
            .filter(Boolean)
            .join("\n\n"),
          buttons: [[{ text: "Пропустить", callback: "bd:skip" }]],
        },
      ];
      await this.persist(inbound, user.id, "reg_birthday", {});
      return { userId: user.id, messages };
    }
    return this.finishProfile(user, inbound, false, note);
  }

  private async consentMessages(user: UserRecord, inbound: InboundMessage, kind: "ask" | "renew" | "refuse") {
    const policy = this.salon.policyPublic();
    const messages: OutMessage[] = [];
    if (kind === "ask") {
      messages.push({
        text: venue.copy.greeting,
      });
    }
    const text =
      kind === "refuse"
        ? "Без согласия на обработку персональных данных запись и бонусная карта недоступны. Если передумаете, нажмите «Согласен»."
        : kind === "renew"
          ? `Политика обработки персональных данных обновилась до версии ${policy.version}. Подтвердите согласие, чтобы пользоваться записью и картой. Телефон и имя заново не спрашиваем.\nПолитика: ${policy.url}\nСогласие: ${policy.consentUrl}`
          : `Нужно согласие на обработку персональных данных — имени, телефона, дня рождения и записей.\nПолитика: ${policy.url}\nСогласие: ${policy.consentUrl}\nВерсия ${policy.version}.`;
    messages.push({
      text,
      buttons: [
        [{ text: "Согласен", callback: "pd:yes" }],
        [{ text: "Не согласен", callback: "pd:no" }],
        [
          { text: "Политика", url: policy.url },
          { text: "Согласие", url: policy.consentUrl },
        ],
      ],
    });
    await this.persist(inbound, user.id, "reg_consent", {});
    return { userId: user.id, messages };
  }

  private async promoMessages(user: UserRecord, inbound: InboundMessage, renew: boolean) {
    const messages: OutMessage[] = [
      {
        text: [
          renew
            ? "Политика обновилась. Рекламные сообщения снова спрашиваем отдельно."
            : "Отдельно — согласие на рекламные сообщения. Это не то же самое, что согласие на обработку данных.",
          "«Согласен» — акции и напоминание, что пора стричься.",
          "«Не согласен» — таких сообщений не будет. Запись, подтверждения и напоминания о визите приходят в любом случае, бот остаётся доступен.",
        ].join("\n"),
        buttons: [
          [{ text: "Согласен", callback: "pr:yes" }],
          [{ text: "Не согласен", callback: "pr:no" }],
        ],
      },
    ];
    await this.persist(inbound, user.id, "reg_promo", {});
    return { userId: user.id, messages };
  }

  private async nameMessages(user: UserRecord, inbound: InboundMessage, note: string) {
    const known = user.firstName?.trim() ?? "";
    const canKeep = known.length >= 2;
    const question = canKeep
      ? venue.copy.nameAskKnown.replace("{name}", known)
      : venue.copy.nameAsk;
    const messages: OutMessage[] = [
      {
        text: [note, question].filter(Boolean).join("\n\n"),
        removeKeyboard: true,
      },
    ];
    if (canKeep) {
      messages.push({
        text: "Можно оставить имя из профиля.",
        buttons: [[{ text: `Оставить ${known}`, callback: "nm:keep" }]],
      });
    }
    await this.persist(inbound, user.id, "reg_name", {});
    return { userId: user.id, messages };
  }

  private async finishProfile(user: UserRecord, inbound: InboundMessage, intro: boolean, note: string) {
    const home = await this.home(user);
    const lead = [note, intro ? venue.copy.cardReady : ""].filter(Boolean).join("\n\n");
    const messages = [
      {
        ...home,
        text: lead ? `${lead}\n\n${home.text}` : home.text,
      },
    ];
    await this.persist(inbound, user.id, "menu", {});
    return { userId: user.id, messages };
  }

  private async showBranches(user: UserRecord, inbound: InboundMessage, draft: Draft) {
    const branches = await this.salon.branches();
    const messages: OutMessage[] = [
      {
        text: "Выбери филиал",
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
        text: "Выбери услугу",
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
          text: `${masterChoiceLabel(master.name, master.levelLabel)} · ${formatPrice(master.priceRub, master.priceFrom)}`,
          callback: `ms:${master.id}`,
        },
      ]),
      [{ text: "В меню", callback: "nav:menu" }],
    ];
    const messages: OutMessage[] = [{ text: "Выбери мастера", buttons }];
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
        text: "Выбери день",
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
          text: "В этот день свободных окон нет. Выбери другую дату.",
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
          `Готово, ты записан: ${when}, ${booked.appointment.service.name}, ${booked.appointment.barber.name}, ${booked.appointment.branch.name}.`,
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
        text: `На карте ${card.balance} ₽. Кэшбэк ${card.cashbackPercent}% с визита — общий на все филиалы. На кассе покажи QR в мини-приложении.`,
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
        text: `Приведи друга: обоим по ${card.referralBonus} ₽ после его первого визита.\n${card.referralLink}`,
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
