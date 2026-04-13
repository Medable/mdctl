const pinnedVersion = org.objects.c_study
  .find()
  .paths('c_pinned_version')
  .skipAcl()
  .grant(consts.accessLevels.read)
  .toArray()[0]
  .c_pinned_version

if (pinnedVersion >= 40000) {
  throw Fault.create('cortex.accessDenied.app', { reason: `Apps Dashboard is not supported in studies with pinned version >= 40000. Current pinned version: ${pinnedVersion}` })
}