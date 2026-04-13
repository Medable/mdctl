import nucUtils from 'c_nucleus_utils';
import req from 'request';

const studyId = req.params.studyId

return org.objects.c_sites.find({c_study:studyId}).skipAcl().grant(consts.accessLevels.read).map(item => {return nucUtils.removeDefaultProps(item)});