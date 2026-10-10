export function calculateBulletinAverage(grades: number[]): number {
  if (grades.length === 0) throw new Error("BULLETIN_WITHOUT_GRADES");
  if (
    grades.some((grade) => !Number.isFinite(grade) || grade < 0 || grade > 10)
  )
    throw new Error("BULLETIN_GRADE_INVALID");
  const average = grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
  return Math.round((average + Number.EPSILON) * 100) / 100;
}
