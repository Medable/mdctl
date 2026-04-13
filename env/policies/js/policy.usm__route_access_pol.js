const [study] = org.objects.c_study
  .find()
  .skipAcl()
  .grant(consts.accessLevels.read)
  .toArray()

if (study && study.c_pinned_version >= 40000) {
  throw Fault.create('cortex.accessDenied.app', { reason: `USM is not supported in studies with pinned version >= 40000. Current pinned version: ${study.c_pinned_version}` })
}