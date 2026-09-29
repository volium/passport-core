import type { CheckIn, StampOrder } from './models.js';

/** Collection is derived from visits; ordering never changes a visit timestamp. */
export function collectionDates(visits: CheckIn[]): Map<string, string> {
  const dates = new Map<string, string>();
  for (const v of visits) if (!v.historyOnly && (!dates.has(v.airportId) || v.visitedAt < dates.get(v.airportId)!)) dates.set(v.airportId, v.visitedAt);
  return dates;
}

/** Same-day visits have no known time: label the date without inventing which visit came first. */
export function visitStampLabel(visit: CheckIn, stampDate: string | undefined): string {
  return visit.historyOnly ? 'Visit only - excluded from stamp collection' : visit.visitedAt === stampDate ? 'Stamp collection date' : 'Repeat visit';
}

export function reconcileOrders(before: CheckIn[], after: CheckIn[], orders: StampOrder[]): StampOrder[] {
  const oldDates = collectionDates(before), dates = collectionDates(after);
  return [...new Set(dates.values())].sort().map(date => {
    const members = [...dates.keys()].filter(id => dates.get(id) === date);
    const existing = orders.find(o => o.date === date);
    const kept = (existing?.airportIds ?? []).filter(id => dates.get(id) === date && oldDates.get(id) === date);
    const time = (id: string) => {
      const visits = after.filter(v => v.airportId === id && !v.historyOnly && v.visitedAt === date);
      return visits.length && visits.every(v => v.timeKnown && v.capturedAt) ? visits.map(v => v.capturedAt!).sort()[0] : undefined;
    };
    const added = members.filter(id => !kept.includes(id)).sort();
    // Existing explicit order always wins. Fully timed, unconfirmed days can follow capture time.
    if (!existing?.confirmed && members.every(id => !!time(id)) && kept.every((id, index) => !index || time(kept[index - 1])! <= time(id)!)) {
      return { date, airportIds: members.sort((a,b) => time(a)!.localeCompare(time(b)!) || a.localeCompare(b)), confirmed:false };
    }
    return { date, airportIds: [...kept, ...added], confirmed: !!existing?.confirmed && !added.length };
  });
}

export function collectionChanges(before: CheckIn[], after: CheckIn[]): string[] {
  const oldDates = collectionDates(before), dates = collectionDates(after);
  return [...oldDates].filter(([id, date]) => dates.get(id) !== date).map(([id, date]) =>
    dates.has(id) ? `${id}: stamp moves from ${date} to ${dates.get(id)}.` : after.some(v => v.airportId === id) ? `${id}: the stamp collection date will be removed. Visit-only records remain in history.` : `${id}: the last visit and collected stamp will be removed.`);
}

export function validateOrders(value: unknown, visits: CheckIn[]): value is StampOrder[] {
  if (!Array.isArray(value) || value.length > 10000) return false;
  const dates = collectionDates(visits), seenDates = new Set<string>(), seenIds = new Set<string>();
  for (const order of value) {
    if (!order || typeof order.date !== 'string' || seenDates.has(order.date) || typeof order.confirmed !== 'boolean' || !Array.isArray(order.airportIds) || !order.airportIds.length || order.airportIds.length > 10000) return false;
    seenDates.add(order.date);
    for (const id of order.airportIds) {
      if (typeof id !== 'string' || seenIds.has(id) || dates.get(id) !== order.date) return false;
      seenIds.add(id);
    }
  }
  return seenIds.size === dates.size;
}

/** Display positions derive from persisted dates and same-day order, never visit creation time. */
export function collectionSequence(visits: CheckIn[], orders: StampOrder[]) {
  let number = 0;
  return reconcileOrders(visits, visits, orders).flatMap(order =>
    order.airportIds.map(airportId => ({ airportId, date: order.date, number: ++number,
      provisional: order.airportIds.length > 1 && !order.confirmed })));
}
