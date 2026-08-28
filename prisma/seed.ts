import { PrismaClient } from "@prisma/client";
import { DEFAULT_SETTINGS } from "../src/domain/settings.ts";

const prisma = new PrismaClient();

async function main() {
  const settings: Record<string, string> = {
    percent: String(DEFAULT_SETTINGS.percent),
    registrationBonus: String(DEFAULT_SETTINGS.registrationBonus),
    birthdayBonus: String(DEFAULT_SETTINGS.birthdayBonus),
    visitHours: String(DEFAULT_SETTINGS.visitHours),
    winnersCount: String(DEFAULT_SETTINGS.winnersCount),
    prizeTable: JSON.stringify(DEFAULT_SETTINGS.prizeTable),
  };

  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  await prisma.contentPage.upsert({
    where: { slug: "contacts" },
    create: { slug: "contacts", body: "", mapUrl: null },
    update: {},
  });
  await prisma.contentPage.upsert({
    where: { slug: "directions" },
    create: { slug: "directions", body: "", mapUrl: null },
    update: {},
  });
  await prisma.contentPage.upsert({
    where: { slug: "game_rules" },
    create: {
      slug: "game_rules",
      body:
        "Каждую неделю мы подводим итоги игр в «Друзьях». Очки из всех игр складываются в общий зачёт — призы получают лучшие по сумме. В каждой игре есть отдельный рейтинг, чтобы видеть свои успехи. Очки начисляются только во время визита. В конце недели лучшие гости получают бонусы и купоны по таблице призов. Играйте честно и возвращайтесь снова!",
      mapUrl: null,
    },
    update: {},
  });

  await prisma.game.upsert({
    where: { slug: "match3" },
    create: {
      slug: "match3",
      title: "Три в ряд",
      active: true,
      maxScorePerSession: 50000,
    },
    update: {},
  });

  await prisma.game.upsert({
    where: { slug: "blockblast" },
    create: {
      slug: "blockblast",
      title: "Блоки",
      active: true,
      maxScorePerSession: 50000,
    },
    update: {},
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
