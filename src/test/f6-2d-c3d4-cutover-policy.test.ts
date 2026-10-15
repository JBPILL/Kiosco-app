import { describe, expect, it } from 'vitest'
import { evaluateDemoOnlyZeroRowCutover } from '../../scripts/f6-2d-c3a-exporter.mjs'

const passingConditions = {
  allCandidateKiosksExcluded: true,
  zeroIncludedRows: true,
  zeroUnresolvedRows: true,
  classificationApproved: true,
  candidateCoverageComplete: true,
  kioskProvenanceApproved: true,
  packageReconciled: true,
  zeroMigrableRows: true,
  allBlockersBelongToExcludedKiosks: true,
  noMigrableBlockerDependents: true,
  zeroOrphans: true,
  zeroCrossKiosk: true,
  sourceSchemaMatches: true,
  checksumsMatch: true,
}
const reviewedBlockers = { openSessions: 4, linkedSales: 14, linkedCashMovements: 1 }

describe('F6.2D-C3D-4 demo-only zero-row cutover policy', () => {
  it('marks only the reviewed zero-row demo set as not applicable after every gate passes', () => {
    expect(evaluateDemoOnlyZeroRowCutover({
      conditions: passingConditions,
      blockers: reviewedBlockers,
      expectedBlockers: reviewedBlockers,
    })).toMatchObject({
      cutoverClass: 'DEMO_ONLY_ZERO_ROW_CUTOVER_NOT_APPLICABLE',
      cashClosureRequirement: 'NOT_APPLICABLE_DEMO_ONLY_SOURCE',
      finalDataDeltaRequired: false,
      finalDataExportRequired: false,
      failedConditions: [],
      mismatchedBlockers: [],
    })
  })

  it.each([
    ['one kiosk is included', 'allCandidateKiosksExcluded'],
    ['one row is included', 'zeroIncludedRows'],
    ['one candidate is unresolved', 'zeroUnresolvedRows'],
    ['classification is not approved', 'classificationApproved'],
    ['candidate coverage is incomplete', 'candidateCoverageComplete'],
    ['kiosk provenance is incomplete', 'kioskProvenanceApproved'],
    ['the package is not reconciled', 'packageReconciled'],
    ['migrable rows remain', 'zeroMigrableRows'],
    ['a blocker belongs to a non-excluded tenant', 'allBlockersBelongToExcludedKiosks'],
    ['a migrable dependent row exists', 'noMigrableBlockerDependents'],
    ['an orphan exists', 'zeroOrphans'],
    ['a cross-kiosk relation exists', 'zeroCrossKiosk'],
    ['the source fingerprint differs', 'sourceSchemaMatches'],
    ['a reviewed checksum differs', 'checksumsMatch'],
  ])('fails closed when %s', (_description, condition) => {
    const conditions = { ...passingConditions, [condition]: false }
    expect(evaluateDemoOnlyZeroRowCutover({
      conditions,
      blockers: reviewedBlockers,
      expectedBlockers: reviewedBlockers,
    })).toMatchObject({
      cutoverClass: 'OPERATIONAL_CUTOVER_REQUIRED',
      cashClosureRequirement: 'CUTOVER_BLOCKER',
      finalDataDeltaRequired: true,
      finalDataExportRequired: true,
    })
  })

  it('keeps cash closure blocking when this set has a different blocker count', () => {
    expect(evaluateDemoOnlyZeroRowCutover({
      conditions: passingConditions,
      blockers: { ...reviewedBlockers, linkedSales: 15 },
      expectedBlockers: reviewedBlockers,
    })).toMatchObject({
      cutoverClass: 'OPERATIONAL_CUTOVER_REQUIRED',
      cashClosureRequirement: 'CUTOVER_BLOCKER',
      mismatchedBlockers: ['linkedSales'],
    })
  })
})
