import nucUtils from 'c_nucleus_utils';
import req from 'request';

const studyId = req.params.studyId,
    {c_studies, c_sites} = org.objects,
    newSites = req.body.data.map(item => {item.c_study = studyId; return item});

if(c_sites.find({c_study:studyId}).skipAcl().grant(consts.accessLevels.read).count() > 0){
     throw new Error('Sites Already Exist in this study. For safety this script should only be used to import to clean studies');
}
else{
    return c_sites.insertMany(newSites).skipAcl().grant(consts.accessLevels.update).execute();
}