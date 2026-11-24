export function isStaffActorId(id: string | null | undefined): boolean {
  return typeof id === "string" && /^(tech|assist|bench)-/.test(id)
}

export function coachEjectedByTechnicals(coachTechnicals: number, benchTechnicals: number): boolean {
  return coachTechnicals >= 2 || benchTechnicals >= 3 ||
    (coachTechnicals >= 1 && benchTechnicals >= 2)
}
