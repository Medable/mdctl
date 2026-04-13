const cache = require('cache');

const http = require('http');

const vendor = org.objects.int__vendor.readOne({ int__identifier: 'int__oracle' })
  .grant('read')
  .execute();

const httpClient = http;

function createIntSites(getSitesUrl, options, medableStudy) {
  const siteResult = httpClient.get(getSitesUrl, options);
  const oracleSites = JSON.parse(siteResult.body).Resources;
  const medableSites = org.objects.c_site
    .find({ c_study: medableStudy._id })
    .skipAcl()
    .grant('read')
    .paths(['c_name'])
    .toArray();
  const unmappedSites = [],
    sitePairs = [],
    mappedSites = [];
  medableSites.forEach((ms) => {
    const correspondingOracleSite = oracleSites.find((os) => {
      return os.sdf.name.trim() === ms.c_name.trim();
    });
    if (!correspondingOracleSite) {
      unmappedSites.push({
        medableSite: ms.c_name,
      });
      return;
    }
    if (ms && correspondingOracleSite) {
      const timeZoneProperty = correspondingOracleSite.sdfPropertyList.find((p) => {
        return p.propertyName === 'TIMEZONE';
      });
      sitePairs.push({
        int__medable_site: ms._id,
        int__vendor_site: correspondingOracleSite.sdf.id,
        int__tz: timeZoneProperty.propertyValue,
        int__vendor: vendor._id,
      }); // this is to create int__site
      mappedSites.push({
        siteName: ms.c_name,
        medableSite: ms._id,
        oracleSite: correspondingOracleSite.sdf.id,
      });
    }
  });

  sitePairs.forEach((sp) => {
    const existingOracSite = org.objects.int__site
      .find({
        int__vendor_site: sp.int__vendor_site,
      })
      .skipAcl()
      .grant('read');
    if (existingOracSite.count() === 0) {
      org.objects.int__site.insertOne(sp)
        .bypassCreateAcl()
        .grant('update')
        .execute();
    } else {
      org.objects.int__site
        .updateOne(
          {
            int__vendor_site: sp.int__vendor_site,
          },
          {
            $set: sp,
            int__vendor: vendor._id,
          },
        )
        .skipAcl()
        .grant('update')
        .execute();
    }
  });
  return { unmappedSites, mappedSites };
}

function createOracFormsForGeneralTasks({
  medableTasks,
  oracleForms,
  formsForEvents,
  mappedForms,
  unmappedForms,
}) {
  const formPairs = [];

  medableTasks.forEach((mt, i) => {
    const correspondingOracleForm = oracleForms.find((of) => {
      return of.title.trim() === mt.c_name.trim();
    });

    if (mt && correspondingOracleForm) {

      const event = formsForEvents.find((f) => {
        return f.formId === correspondingOracleForm.id;
      });

      if (event) {
        mappedForms.push({
          taskName: mt.c_name,
          medableTaskId: mt._id,
          oracleFromId: correspondingOracleForm.id,
        });
        formPairs.push({
          type: 'int__regular',
          int__medable_task: mt._id,
          int__external_id: correspondingOracleForm.id,
          int__event_id: event.int__event_id,
          int__event_type: event.int__event_type,
          int__repeating_form: correspondingOracleForm.repeat,
          int__external_name: correspondingOracleForm.title,
          int__vendor: vendor._id,
        }); // this is to create int__form. It also needs reference to events
      } else {
        unmappedForms.push({
          medableForm: mt.c_name,
        });
      }
    } else {
      unmappedForms.push({
        medableForm: mt.c_name,
      });
    }
  });
  formPairs.forEach((fp) => {
    const existingOracForm = org.objects.int__form
      .find({
        int__external_name: fp.int__external_name,
      })
      .skipAcl()
      .grant('read');
    if (existingOracForm.count() === 0) {
      org.objects.int__form.insertOne(fp)
        .bypassCreateAcl()
        .grant('update')
        .execute();
    } else {
      delete fp.type;
      org.objects.int__form
        .updateOne(
          {
            int__external_name: fp.int__external_name,
          },
          { $set: fp, int__vendor: vendor._id },
        )
        .skipAcl()
        .grant('update')
        .execute();
    }
  });
}

function createOracMappingsForTelevisitTasks({
  televisitForm,
  televisitEvent,
  mappedForms,
  unmappedForms,
  mappedSteps,
  unmappedSteps,
  oracFormQuestionsList,
}) {
  if (!televisitForm) {
    unmappedForms.push({
      medableForm: 'Televisit',
    });
    return;
  }

  const formBody = {
    type: 'int__televisit',
    int__external_id: televisitForm.id,
    int__event_id: televisitEvent.int__event_id,
    int__external_name: televisitForm.title,
    int__vendor: vendor._id,
    int__event_type: televisitEvent.int__event_type,
    int__repeating_form: televisitForm.repeat,
  };

  mappedForms.push({
    taskName: 'Televisit',
    type: 'int__televisit',
    oracleFromId: televisitForm.id,
  });
  const existingOracForm = org.objects.int__form
    .find({
      int__external_name: formBody.int__external_name,
      type: 'int__televisit',
    })
    .skipAcl()
    .grant('read');

  let orac__formId;
  if (existingOracForm.count() === 0) {
    orac__formId = org.objects.int__form
      .insertOne(formBody)
      .bypassCreateAcl()
      .grant('update')
      .execute();
  } else {
    delete formBody.type;
    orac__formId = org.objects.int__form
      .updateOne(
        {
          int__external_name: formBody.int__external_name,
        },
        { $set: formBody, int__vendor: vendor._id },
      )
      .skipAcl()
      .grant('update')
      .execute();
  }

  let startTimeItemBody, endTimeItemBody, bothPartiesPresentItemBody, callIdItemBody;
  const startTimeItem = televisitForm.items.find((i) => {
    return i.questionLabel.trim() === 'Televisit start time (UTC)';
  });
  if (!startTimeItem) {
    unmappedSteps.push({
      taskName: 'Televisit',
      stepName: 'Televisit start time (UTC)',
    });
  } else {
    startTimeItemBody = {
      type: 'int__televisit',
      int__external_id: startTimeItem.id,
      int__external_name: startTimeItem.questionLabel,
      int__external_type: startTimeItem.questionType,
      int__form: orac__formId,
      int__question_label: 'TELEVISIT_STARTTIME',
      int__vendor: vendor._id,
    };
  }
  const endTimeItem = televisitForm.items.find((i) => {
    return i.questionLabel.trim() === 'Televisit end time (UTC)';
  });
  if (!endTimeItem) {
    unmappedSteps.push({
      taskName: 'Televisit',
      stepName: 'Televisit end time (UTC)',
    });
  } else {
    endTimeItemBody = {
      type: 'int__televisit',
      int__external_id: endTimeItem.id,
      int__external_name: endTimeItem.questionLabel,
      int__external_type: endTimeItem.questionType,
      int__form: orac__formId,
      int__question_label: 'TELEVISIT_ENDTIME',
      int__vendor: vendor._id,
    };
  }
  const bothPartiesPresentItem = televisitForm.items.find((i) => {
    return i.questionLabel.trim() === 'Did both parties join the televisit?';
  });
  if (!bothPartiesPresentItem) {
    unmappedSteps.push({
      taskName: 'Televisit',
      stepName: 'Did both parties join the televisit?',
    });
  } else {
    bothPartiesPresentItemBody = {
      type: 'int__televisit',
      int__external_id: bothPartiesPresentItem.id,
      int__external_name: bothPartiesPresentItem.questionLabel,
      int__external_type: bothPartiesPresentItem.questionType,
      int__form: orac__formId,
      int__question_label: 'TELEVISIT_PARTICIPANTS',
      int__vendor: vendor._id,
    };
  }
  const callIdItem = televisitForm.items.find((i) => {
    return i.questionLabel.trim() === 'Call Id';
  });
  if (!callIdItem) {
    unmappedSteps.push({
      taskName: 'Televisit',
      stepName: 'Call Id',
    });
  } else {
    callIdItemBody = {
      type: 'int__televisit',
      int__external_id: callIdItem.id,
      int__external_name: callIdItem.questionLabel,
      int__external_type: callIdItem.questionType,
      int__form: orac__formId,
      int__question_label: 'TELEVISIT_CALL_ID',
      int__vendor: vendor._id,
    };
  }
  const itembodies = [
    startTimeItemBody,
    endTimeItemBody,
    bothPartiesPresentItemBody,
    callIdItemBody,
  ];
  itembodies.forEach((ibody) => {
    if (ibody) {
      mappedSteps.push({
        StepName: ibody.int__form_item_name,
        type: ibody.type,
        oracleItemId: ibody.int__form_item_id,
      });
      oracFormQuestionsList.push(ibody);
    }
  });
}

function createOracMappingsForEconsentTasks({
  econsentForm,
  econsentEvent,
  mappedForms,
  unmappedForms,
  mappedSteps,
  unmappedSteps,
  oracFormQuestionsList,
}) {
  if (!econsentForm) {
    unmappedForms.push({
      medableForm: 'eConsent',
    });
    return;
  }

  const formBody = {
    type: 'int__econsent',
    int__external_id: econsentForm.id,
    int__event_id: econsentEvent.int__event_id,
    int__external_name: econsentForm.title,
    int__vendor: vendor._id,
    int__event_type: econsentEvent.int__event_type,
    int__repeating_form: econsentForm.repeat,
  };
  mappedForms.push({
    taskName: 'eConsent',
    type: 'int__econsent',
    oracleFromId: econsentForm.id,
  });
  const existingOracForm = org.objects.int__form
    .find({
      int__external_name: formBody.int__external_name,
      type: 'int__econsent',
    })
    .skipAcl()
    .grant('read');
  let orac__formId;
  if (existingOracForm.count() === 0) {
    orac__formId = org.objects.int__form
      .insertOne(formBody)
      .bypassCreateAcl()
      .grant('update')
      .execute();
  } else {
    delete formBody.type;
    orac__formId = org.objects.int__form
      .updateOne(
        {
          int__external_name: formBody.int__external_name,
        },
        { $set: formBody, int__vendor: vendor._id },
      )
      .skipAcl()
      .grant('update')
      .execute();
  }

  let consentDateItemBody, apprvoerNameItemBody, apprvoerRolesItemBody, econsDocIdItemBody;
  const consentDateItem = econsentForm.items.find((i) => {
    return i.questionLabel.trim() === 'Date of Consent';
  });
  if (!consentDateItem) {
    unmappedSteps.push({
      taskName: 'eConsent',
      stepName: 'Date of Consent',
    });
  } else {
    consentDateItemBody = {
      type: 'int__econsent',
      int__external_id: consentDateItem.id,
      int__external_name: consentDateItem.questionLabel,
      int__external_type: consentDateItem.questionType,
      int__form: orac__formId,
      int__question_label: 'date_of_consent',
      int__vendor: vendor._id,
    };
  }

  const apprvoerNameItem = econsentForm.items.find((i) => {
    return i.questionLabel.trim() === 'Approver Name';
  });
  if (!apprvoerNameItem) {
    unmappedSteps.push({
      taskName: 'eConsent',
      stepName: 'Approver Name',
    });
  } else {
    apprvoerNameItemBody = {

      type: 'int__econsent',
      int__external_id: apprvoerNameItem.id,
      int__external_name: apprvoerNameItem.questionLabel,
      int__external_type: apprvoerNameItem.questionType,
      int__form: orac__formId,
      int__question_label: 'approver_name',
      int__vendor: vendor._id,
    };
  }
  const apprvoerRolesItem = econsentForm.items.find((i) => {
    return i.questionLabel.trim() === 'Approver Roles';
  });
  if (!apprvoerRolesItem) {
    unmappedSteps.push({
      taskName: 'eConsent',
      stepName: 'Approver Roles',
    });
  } else {
    apprvoerRolesItemBody = {
      type: 'int__econsent',
      int__external_id: apprvoerRolesItem.id,
      int__external_name: apprvoerRolesItem.questionLabel,
      int__external_type: apprvoerRolesItem.questionType,
      int__form: orac__formId,
      int__question_label: 'approver_role',
      int__vendor: vendor._id,
    };
  }

  const econsDocIdItem = econsentForm.items.find((i) => {
    return i.questionLabel.trim() === 'eConsent Document ID';
  });
  if (!econsDocIdItem) {
    unmappedSteps.push({
      taskName: 'eConsent',
      stepName: 'eConsent Document ID',
    });
  } else {
    econsDocIdItemBody = {
      type: 'int__econsent',
      int__external_id: econsDocIdItem.id,
      int__external_name: econsDocIdItem.questionLabel,
      int__external_type: econsDocIdItem.questionType,
      int__form: orac__formId,
      int__question_label: 'econsent_document_id',
      int__vendor: vendor._id,
    };
  }
  const itembodies = [
    consentDateItemBody,
    apprvoerNameItemBody,
    apprvoerRolesItemBody,
    econsDocIdItemBody,
  ];
  itembodies.forEach((i_body) => {
    if (i_body) {
      mappedSteps.push({
        StepName: i_body.int__form_item_name,
        type: i_body.type,
        oracleItemId: i_body.int__form_item_id,
      });
      oracFormQuestionsList.push(i_body);
    }
  });

  mapEconsentCustomFields({
    econsentForm,
    mappedSteps,
    oracFormQuestionsList,
    unmappedSteps,
    orac__formId,
  });
}

function mapEconsentCustomFields({
  econsentForm,
  mappedSteps,
  oracFormQuestionsList,
  unmappedSteps,
  stepRemark,
  orac__formId,
}) {
  const templates = org.objects.ec__document_template.find({
    ec__status: 'published',
  });
  const eConsentTemplate = templates.filter((doc) => {
    return (
      doc.ec__custom_data.filter((data) => {
        return data.ec__label.trim() === 'oracle subject enrollment';
      }) && doc.ec__published != null
    );
  });

  eConsentTemplate.forEach((template) => {
    template.ec__requested_data.forEach((data) => {
      const oracItem = econsentForm.items.find((i) => {
        return i.questionLabel.trim() === data.ec__title.trim();
      });
      if (oracItem) {
        const customDataBody = {
          type: 'int__econsent',
          int__external_id: oracItem.id,
          int__external_name: oracItem.questionLabel,
          int__external_type: oracItem.questionType,
          int__form: orac__formId,
          int__identifier: data.ec__key,
          int__vendor: vendor._id,
        };
        mappedSteps.push({
          StepName: customDataBody.int__form_item_name,
          type: customDataBody.type,
          oracleItemId: customDataBody.int__form_item_id,
        });
        oracFormQuestionsList.push(customDataBody);
      } else {
        unmappedSteps.push({
          taskName: 'eConsent',
          stepName: data.ec__title,
          remark: `${stepRemark} - ${data.ec__title}`,
        });
      }
    });
  });
}

function mapItems({
  oracleForms,
  medableTasks,
  items,
  unmappedSteps,
  mappedSteps,
  oracFormQuestionsList,
}) {
  let correspondingMedableTask;
  oracleForms.forEach((f) => {
    correspondingMedableTask = medableTasks.find((mt) => {
      return f.title.trim() === mt.c_name.trim();
    });
    if (!correspondingMedableTask) return;

    const oracFormObject = org.objects.int__form
      .find({ int__medable_task: correspondingMedableTask._id })
      .next();
    if (!oracFormObject) {
      return;
    }
    const medableSteps = org.objects.c_steps
      .find({ c_task: correspondingMedableTask._id })
      .skipAcl()
      .grant('read')
      .paths(['c_name'])
      .toArray();
    items = f.items;
    items.forEach((i) => {
      if (i.questionType.trim() === 'questionGroup') {
        items = [...items, ...i.items];
        const index = items.indexOf(i);
        if (index > -1) {
          items.splice(index, 1);
        }
      }
    });
    medableSteps.forEach((ms) => {
      const coerrespondingItem = items.find((i) => {
        return i.questionLabel.trim() === ms.c_name.trim();
      });
      if (!coerrespondingItem) {
        unmappedSteps.push({
          taskName: correspondingMedableTask.c_name,
          stepName: ms.c_name,
        });
        return;
      }
      mappedSteps.push({
        StepName: ms.c_name,
        oracleItemId: coerrespondingItem.id,
        medableStepId: ms._id,
      });
      oracFormQuestionsList.push({
        type: 'int__regular',
        int__external_id: coerrespondingItem.id,
        int__external_name: coerrespondingItem.questionLabel,
        int__external_type: coerrespondingItem.questionType,
        int__form: oracFormObject._id,
        int__medable_step: ms._id,
        int__vendor: vendor._id,
      });
    });
  });
}

function getVendorSecrets() {

  const secrets = org.objects.int__secret.find({
    int__vendor: vendor._id,
  })
    .expand(['int__value'])
    .toArray();

  return (secrets || []).reduce((obj, item) => {
    return Object.assign(obj, { [item.int__identifier]: item });
  }, {});
}

class OracleSetup {

  cachePrefix = 'oracle_token';

  static mapping() {
    const secrets = getVendorSecrets();

    const mappedForms = [],
      mappedSteps = [];
    const bulkOps = org.objects.bulk();

    const baseUrl = secrets.int__oracle_base_url.int__value;
    const authGrantType = secrets.int__oracle_auth_grant_type.int__value;
    const authScope = secrets.int__oracle_auth_scope.int__value;
    const authPath = secrets.int__oracle_auth_path.int__value;
    const authDomain = secrets.int__oracle_auth_domain.int__value;
    const accessToken = secrets.int__oracle_access_token.int__value;
    // fetch auth token
    const authentiCateUrl = `https://${authDomain}${authPath}`;
    let options = {
      strictSSL: null,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${accessToken}`,
      },
      body: `grant_type=${authGrantType}&scope=${authScope}`,
      buffer: null,
      timeout: null,
      sslOptions: null,
    };
    let result, access_token;
    try {
      result = httpClient.post(authentiCateUrl, options);
      access_token = JSON.parse(result.body).access_token;
    } catch (error) {
      return {
        error,
      };
    }

    // study mapping
    const medableStudy = org.objects.c_study.readOne()
      .skipAcl()
      .grant('read')
      .execute();

    const getStudyUrl = `${baseUrl}/ec-designer-svc/rest/v2.0/studies`;
    options = {
      strictSSL: null,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${access_token}`,
      },
      body: `grant_type=${authGrantType}&scope=${authScope}`,
      buffer: null,
      timeout: null,
      sslOptions: null,
    };
    const studyResult = httpClient.get(getStudyUrl, options);
    const oracleStudies = JSON.parse(studyResult.body).result;
    const oracleStudy = oracleStudies.find((s) => {
      return s.studyTitle.trim() === medableStudy.c_name.trim();
    });
    if (!oracleStudy) {
      return {
        unmappedStudy: { studyName: medableStudy.c_name },
      };
    }

    // update secret to match the study Id
    org.objects.int__secret.updateOne(
      { int__identifier: 'int__oracle_study' },
      { $set: { int__value: oracleStudy.id } },
    )
      .skipAcl()
      .grant('update')
      .execute();

    const getSitesUrl = `${baseUrl}/ec-ors-svc/rest/v1.0/studies/${oracleStudy.id}/test/sites`;

    // map oracle sites
    const { unmappedSites, mappedSites } = createIntSites(
      getSitesUrl,
      options,
      medableStudy,
    );

    // fetch events
    const eventVisitTypesUrl = `${baseUrl}/ec-designer-svc/rest/v8.0/studies/${oracleStudy.id}/versions/${oracleStudy.version}/design`;
    const eventsVisitTypeResult = httpClient.get(eventVisitTypesUrl, options);
    const eventsVisitTypes = JSON.parse(eventsVisitTypeResult.body).result; // this is to create orac__event

    const oracleEvents = [
      ...eventsVisitTypes.scheduledVisits,
      ...eventsVisitTypes.unscheduledVisits,
    ];

    const formsForEvents = [];
    oracleEvents.forEach((e) => {
      // eslint-disable-next-line max-len
      const urlFormsForEvents = `${baseUrl}/ec-designer-svc/rest/v14.0/studies/${oracleStudy.id}/versions/${oracleStudy.version}/visits/${e.id}/forms`;
      const formsForEventsResult = httpClient.get(urlFormsForEvents, options);
      const forms = JSON.parse(formsForEventsResult.body).result;

      if (!formsForEvents) return;
      // eslint-disable-next-line array-callback-return
      forms.map((f) => {
        f.int__event_id = e.id;
        f.int__event_type = e.eventType === 'ScheduleAbleVisit' ? 'SCHEDULED' : 'UNSCHEDULED';
      });
      formsForEvents.push(...forms);
    });

    // create forms
    const medableTasks = org.objects.c_task
      .find({ c_study: medableStudy._id })
      .skipAcl()
      .grant('read')
      .paths(['c_name'])
      .toArray();
    // eslint-disable-next-line max-len
    const getOracleFormsUrl = `${baseUrl}/ec-designer-svc/rest/v15.0/studies/${oracleStudy.id}/versions/${oracleStudy.version}/forms/unblinded?&includeExtProps=true`;
    const oracleFormsResult = httpClient.get(getOracleFormsUrl, options);
    const oracleForms = JSON.parse(oracleFormsResult.body).result; // this is to create orac__event
    const unmappedForms = [];

    createOracFormsForGeneralTasks({
      medableTasks,
      oracleForms,
      formsForEvents,
      mappedForms,
      unmappedForms,
    });

    let items;
    const oracFormQuestionsList = [],
      unmappedSteps = [];
    const televisitEvent = formsForEvents.find((of) => {
      return of.formTitle.trim() === 'Televisit';
    });

    const televisitForm = oracleForms.find((of) => {

      return of.title.trim() === 'Televisit';
    });

    createOracMappingsForTelevisitTasks({
      televisitForm,
      televisitEvent,
      mappedForms,
      unmappedForms,
      mappedSteps,
      unmappedSteps,
      oracFormQuestionsList,
    });

    const econsentEvent = formsForEvents.find((of) => {
      return of.formTitle.trim() === 'eConsent';
    });

    const econsentForm = oracleForms.find((of) => {

      return of.title.trim() === 'eConsent';
    });

    createOracMappingsForEconsentTasks({
      econsentForm,
      econsentEvent,
      mappedForms,
      unmappedForms,
      mappedSteps,
      unmappedSteps,
      oracFormQuestionsList,
    });

    mapItems({
      oracleForms,
      medableTasks,
      items,
      unmappedSteps,
      mappedSteps,
      oracFormQuestionsList,
    });
    oracFormQuestionsList.forEach((ofq) => {

      const existingOracFormQuestion = org.objects.int__question
        .find({
          int__external_name: ofq.int__external_name,
          int__form: ofq.int__form,
          type: ofq.type,
        })
        .skipAcl()
        .grant('read');

      if (existingOracFormQuestion.count() === 0) {
        bulkOps.add(
          org.objects.int__question.insertMany([ofq])
            .bypassCreateAcl()
            .grant('update'),

        );
      } else {
        delete ofq.type;
        bulkOps.add(
          org.objects.int__question
            .updateOne(
              {
                int__external_name: ofq.int__external_name,
                int__form: ofq.int__form,
              },
              { $set: ofq },
            )
            .skipAcl()
            .grant('update'),
        );
      }
    });

    const bulkOpResponse = bulkOps
      .async({
        onComplete: `
            const cache = require('cache')
            let err
            if(script.arguments.err){
                err = script.arguments.err
            } 
            else if(script.arguments.memo.error){
                err = script.arguments.memo.error
            }
            const opId = script.arguments.operation._id.toString()
            if(err){
                cache.set(opId, 'error: mapping failed')
                cache.set(opId + '-' + 'error', err)
            }else{
                cache.set(opId, 'Success: mapping completed')
            }
        `,
      })
      .transform(
        `
    each(object, memo) {
    
     if(object.data && object.data.insertedCount != null)  {
       //this is for insertMany
       const error = object.data.writeErrors
    
       if(error) {
        Object.assign(memo, {error: error[0]})
       }
      }
      return object
    }
    `,
      )
      .next();
    // at the end of the bulk operations we set the cache key to it's respective state with bulk operation ID as it's key
    const opId = bulkOpResponse._id.toString();
    cache.set(opId, 'started');
    return {
      bulkOpId: opId,
      status: 'started',
      mappingData: {
        mappedSites,
        mappedForms,
        mappedSteps,
        unmappedSteps,
        unmappedSites,
        unmappedForms,
      },
    };
  }

  static getStatus(bulkOpId) {
    let error;
    const status = cache.get(bulkOpId.toString());
    if (!status) {
      return { status: 'info for bulkId ' + bulkOpId.toString() + ' not found' };
    }
    const state = status.split(':');
    if (state[0] === 'error') {
      error = cache.get(bulkOpId.toString() + '-' + 'error');
    }
    return { status, error };
  }

}

module.exports = OracleSetup;