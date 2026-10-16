import type {
  Activity,
  ActivityCollectionSummary,
  Bulletin,
  ClassDetail,
  ClassSummary,
  Feedback,
  LessonPlan,
} from "@educai/contracts";

import type { Overview } from "./pendencies.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";

// Bounds the extra requests the home page makes per visit.
const MAX_COLLECTIONS = 20;
const MAX_CLASS_DETAILS = 30;

async function readData<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(path);
  return ((await response.json()) as { data: T }).data;
}

const list = <T>(value: T[] | null | undefined): T[] =>
  Array.isArray(value) ? value : [];

// Any failed request rejects, so the home page never shows partial counts.
export async function loadOverview(): Promise<Overview> {
  const [activities, plans, classes, feedbacks, bulletins] = await Promise.all([
    readData<Activity[]>("/activities").then(list),
    readData<LessonPlan[]>("/lesson-plans").then(list),
    readData<ClassSummary[]>("/classes").then(list),
    readData<Feedback[]>("/feedbacks").then(list),
    readData<Bulletin[]>("/bulletins").then(list),
  ]);

  const withAnswers = activities
    .filter(
      (item) =>
        (item.status === "published" || item.status === "finished") &&
        item.responseCount > 0,
    )
    .slice(0, MAX_COLLECTIONS);

  const [collections, details] = await Promise.all([
    Promise.all(
      withAnswers.map((item) =>
        readData<ActivityCollectionSummary | null>(
          `/activities/${item.id}/collection`,
        ),
      ),
    ),
    Promise.all(
      classes
        .slice(0, MAX_CLASS_DETAILS)
        .map((group) => readData<ClassDetail>(`/classes/${group.id}`)),
    ),
  ]);

  return {
    activities,
    plans,
    feedbacks,
    bulletins,
    collections: collections.filter((item): item is ActivityCollectionSummary =>
      Boolean(item && Array.isArray(item.submissions)),
    ),
    classes: classes.slice(0, MAX_CLASS_DETAILS).map((group, index) => ({
      id: group.id,
      name: group.name,
      hasSubject:
        (details[index]?.curriculum?.curricularComponents?.length ?? 0) > 0,
    })),
  };
}
