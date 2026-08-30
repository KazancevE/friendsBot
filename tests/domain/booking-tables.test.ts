import { expect, test } from "vitest";
import { DateTime } from "luxon";
import {
  assignTableToBooking,
  createBookingRequest,
  handleBookingRequest,
  moveBookingTable,
  swapBookingTables,
} from "../../src/domain/booking.ts";
import {
  buildAvailableSlots,
  listFreeTablesForInterval,
} from "../../src/domain/booking-availability.ts";
import { saveFloorPlan, saveVenueTable } from "../../src/domain/floor-plan.ts";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { MemoryStore } from "../../src/store/memory.ts";
import { MOSCOW } from "../../src/domain/week.ts";

const futureSlot = () => {
  const day = DateTime.now().setZone(MOSCOW).plus({ days: 2 }).startOf("day").set({ hour: 19, minute: 0 });
  return day.toJSDate();
};

async function seedFloor(store: MemoryStore) {
  const plan = await saveFloorPlan(store, { name: "Зал" });
  const tableA = await saveVenueTable(store, {
    floorPlanId: plan.id,
    label: "A1",
    seatsMin: 2,
    seatsMax: 4,
    highlights: ["окно"],
  });
  const tableB = await saveVenueTable(store, {
    floorPlanId: plan.id,
    label: "B2",
    seatsMin: 2,
    seatsMax: 6,
  });
  return { plan, tableA, tableB };
}

test("available slots hide fully booked times", async () => {
  const store = new MemoryStore();
  const guest = await store.createUser({
    telegramId: 1n,
    role: "guest",
    firstName: "G",
    lastName: null,
    birthday: null,
    phone: null,
    qrToken: "qr1",
  });
  const { tableA, tableB } = await seedFloor(store);
  const requestedFor = futureSlot();
  await store.createBookingRequest({
    userId: guest.id,
    requestedFor,
    endsAt: new Date(requestedFor.getTime() + 120 * 60 * 1000),
    durationMinutes: 120,
    partySize: 4,
    comment: null,
    tableId: tableA.id,
  });
  await store.updateBooking((await store.listPendingBookings())[0]!.id, { status: "confirmed" });
  await store.createBookingRequest({
    userId: guest.id,
    requestedFor,
    endsAt: new Date(requestedFor.getTime() + 120 * 60 * 1000),
    durationMinutes: 120,
    partySize: 4,
    comment: null,
    tableId: tableB.id,
  });
  const second = (await store.listPendingBookings())[0];
  if (second !== undefined) {
    await store.updateBooking(second.id, { status: "confirmed" });
  }

  const day = DateTime.fromJSDate(requestedFor, { zone: MOSCOW });
  const floorPlan = await store.getActiveFloorPlan();
  const bookings = await store.listBookingsBetween({
    from: day.startOf("day").toJSDate(),
    to: day.endOf("day").toJSDate(),
  });
  const slots = buildAvailableSlots(
    DEFAULT_SETTINGS,
    day,
    4,
    floorPlan!.tables,
    bookings,
    new Date(requestedFor.getTime() - 60 * 60 * 1000),
  );
  expect(slots.some((slot) => slot.requestedFor.getTime() === requestedFor.getTime())).toBe(false);
});

test("guest can book optional table when free", async () => {
  const store = new MemoryStore();
  const guest = await store.createUser({
    telegramId: 2n,
    role: "guest",
    firstName: "G",
    lastName: null,
    birthday: null,
    phone: null,
    qrToken: "qr2",
  });
  const { tableA } = await seedFloor(store);
  const requestedFor = futureSlot();
  const booking = await createBookingRequest(store, {
    userId: guest.id,
    requestedFor,
    partySize: 3,
    comment: "окно",
    tableId: tableA.id,
    now: new Date(requestedFor.getTime() - 60 * 60 * 1000),
  });
  expect(booking.tableId).toBe(tableA.id);
  expect(booking.endsAt).not.toBeNull();
});

test("assign move and swap tables", async () => {
  const store = new MemoryStore();
  const guest = await store.createUser({
    telegramId: 3n,
    role: "guest",
    firstName: "G",
    lastName: null,
    birthday: null,
    phone: null,
    qrToken: "qr3",
  });
  const master = await store.createUser({
    telegramId: 4n,
    role: "master",
    firstName: "M",
    lastName: null,
    birthday: null,
    phone: null,
    qrToken: "qr4",
  });
  const { tableA, tableB } = await seedFloor(store);
  const requestedFor = futureSlot();
  const booking = await createBookingRequest(store, {
    userId: guest.id,
    requestedFor,
    partySize: 2,
    comment: null,
    now: new Date(requestedFor.getTime() - 60 * 60 * 1000),
  });
  await handleBookingRequest(store, {
    bookingId: booking.id,
    actorId: master.id,
    status: "confirmed",
    now: new Date(),
  });
  const assigned = await assignTableToBooking(store, {
    bookingId: booking.id,
    tableId: tableA.id,
    actorId: master.id,
    now: new Date(),
  });
  expect(assigned.tableId).toBe(tableA.id);

  const moved = await moveBookingTable(store, {
    bookingId: booking.id,
    tableId: tableB.id,
    actorId: master.id,
    now: new Date(),
  });
  expect(moved.tableId).toBe(tableB.id);

  const guest2 = await store.createUser({
    telegramId: 5n,
    role: "guest",
    firstName: "G2",
    lastName: null,
    birthday: null,
    phone: null,
    qrToken: "qr5",
  });
  const booking2 = await createBookingRequest(store, {
    userId: guest2.id,
    requestedFor,
    partySize: 2,
    comment: null,
    now: new Date(requestedFor.getTime() - 60 * 60 * 1000),
  });
  await handleBookingRequest(store, {
    bookingId: booking2.id,
    actorId: master.id,
    status: "confirmed",
    now: new Date(),
  });
  await assignTableToBooking(store, {
    bookingId: booking2.id,
    tableId: tableA.id,
    actorId: master.id,
    now: new Date(),
  });
  const swapped = await swapBookingTables(store, {
    bookingIdA: booking.id,
    bookingIdB: booking2.id,
    actorId: master.id,
    now: new Date(),
  });
  expect(swapped.a.tableId).toBe(tableA.id);
  expect(swapped.b.tableId).toBe(tableB.id);
});

test("listFreeTablesForInterval respects party size", () => {
  const requestedFor = futureSlot();
  const interval = {
    start: requestedFor,
    end: new Date(requestedFor.getTime() + 120 * 60 * 1000),
  };
  const tables = [
    {
      id: "t1",
      floorPlanId: "p1",
      label: "Small",
      description: "",
      highlights: [],
      photoUrl: null,
      seatsMin: 1,
      seatsMax: 2,
      posX: 0,
      posY: 0,
      width: 10,
      height: 10,
      rotation: 0,
      sort: 0,
      active: true,
    },
    {
      id: "t2",
      floorPlanId: "p1",
      label: "Large",
      description: "",
      highlights: [],
      photoUrl: null,
      seatsMin: 3,
      seatsMax: 6,
      posX: 0,
      posY: 0,
      width: 10,
      height: 10,
      rotation: 0,
      sort: 1,
      active: true,
    },
  ];
  const free = listFreeTablesForInterval(tables, 4, interval, [], DEFAULT_SETTINGS);
  expect(free.map((table) => table.label)).toEqual(["Large"]);
});
