/**
 * TypeScript types for reports@2.0.0.
 * Frozen per docs/api-contracts/modules/reports.md.
 */

import { z } from 'zod';
import * as schemas from './schemas';

export type AnalyticsQueryParams = z.infer<typeof schemas.analyticsQuerySchema>;
export type DailyQueryParams = z.infer<typeof schemas.dailyQuerySchema>;
export type WeeklyQueryParams = z.infer<typeof schemas.weeklyQuerySchema>;
export type MonthlyPendingQueryParams = z.infer<typeof schemas.monthlyPendingQuerySchema>;
export type AgingQueryParams = z.infer<typeof schemas.agingQuerySchema>;

export type AnalyticsData = z.infer<typeof schemas.analyticsDataSchema>;
export type ConsolidatedAnalyticsData = z.infer<typeof schemas.consolidatedAnalyticsSchema>;
export type CalendarItem = z.infer<typeof schemas.calendarItemSchema>;
export type DashboardData = z.infer<typeof schemas.dashboardResponseDataSchema>;
export type DailyReportData = z.infer<typeof schemas.dailyReportDataSchema>;
export type WeeklyReportData = z.infer<typeof schemas.weeklyReportDataSchema>;
export type MonthlyPendingData = z.infer<typeof schemas.monthlyPendingDataSchema>;
export type AgingInvoiceEntry = z.infer<typeof schemas.agingInvoiceEntrySchema>;
export type AgingBucketDetail = z.infer<typeof schemas.agingBucketDetailSchema>;
export type AgingReportData = z.infer<typeof schemas.agingReportDataSchema>;

export interface AnalyticsResponse {
  data: AnalyticsData | ConsolidatedAnalyticsData;
}

export interface DashboardResponse {
  data: DashboardData;
}

export interface DailyReportResponse {
  data: DailyReportData;
}

export interface WeeklyReportResponse {
  data: WeeklyReportData;
}

export interface MonthlyPendingResponse {
  data: MonthlyPendingData;
}

export interface AgingReportResponse {
  data: AgingReportData;
}
