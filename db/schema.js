import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const checkins = pgTable('checkins', {
  id: serial().primaryKey(),
  name: text().notNull(),
  code: text(),
  phone: text(),
  type: text().notNull(),
  position: text().default(''),
  company: text().default(''),
  matchedEmployer: text('matched_employer'),
  matchedPosition: text('matched_position'),
  checkinTime: text('checkin_time'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const employers = pgTable('employers', {
  id: serial().primaryKey(),
  name: text().notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const employerOpenings = pgTable('employer_openings', {
  id: serial().primaryKey(),
  employerId: integer('employer_id').notNull().references(() => employers.id),
  position: text().notNull(),
});

export const registrationCounts = pgTable('registration_counts', {
  kind: text().primaryKey(),
  count: integer().notNull().default(0),
});
