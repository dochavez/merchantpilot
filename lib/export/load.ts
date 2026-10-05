import { listActions } from '../actions';
import { getDataset } from '../data';
import { buildReportModel, type ReportModel } from './report-model';

export async function loadReportModel(periodDays = 30): Promise<ReportModel> {
  return buildReportModel(await getDataset(), await listActions(), periodDays);
}
