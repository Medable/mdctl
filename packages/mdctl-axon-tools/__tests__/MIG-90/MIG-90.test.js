// eslint-disable-next-line import/no-dynamic-require
const fs = require('fs')
const Transform = require('../../packageScripts/ingestTransform.js')
const StudyManifestTools = require('../../lib/StudyManifestTools')

jest.mock('runtime.transform', () => ({ Transform: class {} }), { virtual: true })
jest.mock('@medable/mdctl-core-utils/privates', () => ({ privatesAccessor: () => ({ options: { dir: __dirname } }) }), { virtual: true })
jest.mock('@medable/mdctl-api-driver', () => ({ Driver: class {} }), { virtual: true })
jest.mock('@medable/mdctl-api-driver/lib/cortex.object', () => ({ Object: class {} }), { virtual: true })
jest.mock('config', () => ({ get: jest.fn(() => '1.0') }), { virtual: true })

describe('checkExportIntegrity', () => {

  const studyManifestTools = new StudyManifestTools,
    successOutputEntities = [
      {
        _id: "6255b8f88348d74431bc3d00",
        object: "c_study",
        created: "2022-04-12T17:38:00.175Z",
        creator: {
          _id: "6255ad09190824e9695d1c63",
          object: "account",
          path: "/accounts/6255ad09190824e9695d1c63"
        },
        owner: {
          _id: "6255ad09190824e9695d1c63",
          object: "account",
          path: "/accounts/6255ad09190824e9695d1c63"
        },
        updated: "2022-04-14T18:43:24.249Z",
        updater: {
          _id: "6255ad09190824e9695d1c63",
          object: "account",
          path: "/accounts/6255ad09190824e9695d1c63"
        },
        access: 7,
        accessRoles: [
          "000000000000000000000004",
          "000000000000000000000007",
          "000000000000000000000006"
        ],
        favorite: false,
        c_auth_task_fields: [
          "email",
          "password"
        ],
        c_self_service_info: {
          c_header: "Support"
        },
        c_default_subject_group: {
          _id: "6255b8f98348d73ac1bc3dc9",
          object: "c_group",
          path: "/c_groups/6255b8f98348d73ac1bc3dc9"
        },
        c_default_participant_schedule: {
          _id: "6255b8f88348d7cc7ebc3d64",
          object: "c_participant_schedule",
          path: "/c_participant_schedules/6255b8f88348d7cc7ebc3d64"
        },
        c_default_subject_site: {
          _id: "6258526c471bcd961f517595",
          object: "c_site",
          path: "/c_sites/6258526c471bcd961f517595"
        },
        c_default_subject_visit_schedule: {
          _id: "62586b414acdda46f4d72314",
          object: "c_visit_schedule",
          path: "/c_visit_schedules/62586b414acdda46f4d72314"
        },
        c_enable_alt_reg: false,
        c_forgot_username_options: [
          "email"
        ],
        c_information: [
        ],
        c_invite_code_ttl: -1,
        c_key: "696f47ee-bed0-4598-9ba4-3ada0c7f60a8",
        c_menu_config: [
        ],
        c_name: "CG183",
        c_patient_app_display_options: {
          c_profile_fields: [
            "c_account.name",
            "c_account.email",
            "c_account.dob",
            "c_account.mobile",
            "c_account.gender"
          ],
          c_show_consent_documents: true,
          c_show_language_selector: false,
          c_show_leave_study: true,
          c_show_site_information: false,
          c_show_subject_number: false
        },
        c_privacy_items: [
        ],
        c_public_group: {
          _id: "6255b8f98348d78b84bc3ddc",
          object: "c_group",
          path: "/c_groups/6255b8f98348d78b84bc3ddc"
        },
        c_reasons_for_change: [
        ],
        c_requires_invite: true,
        c_resources: [
        ],
        c_review_types: [
        ],
        c_store_invite_data: true,
        c_study_contact_information: [
        ],
        c_subject_enrollment_status: "consented",
        c_subject_invite_validation: "email_pin",
        c_subject_menu_config: [
        ],
        c_subject_status_list: [
          {
            c_default: true,
            c_key: "bb4600eb-2b2c-4768-b471-5a4fef6637e4",
            c_status_description: "Subject has been created",
            c_status_value: "new",
            _id: "6255b8f81b7acdab9f14397b"
          },
          {
            c_default: false,
            c_key: "5913be90-cf45-49ce-9f80-2191660064b9",
            c_status_description: "Subject has been assigned an subject ID",
            c_status_value: "consented",
            _id: "6255b8f81b7acdab9f14397c"
          },
          {
            c_default: false,
            c_key: "eac06b0b-162e-4c74-9a3e-ef773efbee3e",
            c_status_description: "Subject has completed the study",
            c_status_value: "complete",
            _id: "6255b8f81b7acdab9f14397d"
          },
        ],
        c_supported_locales: [
          "en_US"
        ],
        c_site_supported_locales: [
        ],
        c_use_advanced_task_scheduler: true,
        c_unique_org_study: "c_unique_org_study",
        c_login_identifier: "email",
        c_use_secure_flag: false,
        c_enable_secured_reg_data: false,
        c_no_pii: false,
        shared: false
      },
      {
        c_key: "76b22a43-dc75-4c88-b17b-b17e44343e12",
        c_study: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          path: "/c_studies/6255b8f88348d74431bc3d00"
        },
        c_visits: [
        ],
        _id: "6255b918b86b1b49ac727422",
        object: "c_task"
      },
      {
        c_key: "a28d0c10-c5c5-4dae-89eb-1997ea98bc22",
        c_study: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          path: "/c_studies/6255b8f88348d74431bc3d00"
        },
        c_visits: [
        ],
        _id: "62573e3968b107d6d235f320",
        object: "c_task"
      },
      {
        c_key: "4f21bcc6-c36c-4fe4-8dfb-dfdd9d558289",
        c_task: {
          _id: "6255b918b86b1b49ac727422",
          object: "c_task",
          path: "/c_tasks/6255b918b86b1b49ac727422"
        },
        _id: "6255b918b86b1bd6c8727446",
        object: "c_step"
      },
      {
        c_key: "eb25cf76-10b5-4f60-8ab6-ba12404fb618",
        c_parent_step: {
          _id: "6255b918b86b1bd6c8727446",
          object: "c_step",
          path: "/c_steps/6255b918b86b1bd6c8727446"
        },
        c_task: {
          _id: "6255b918b86b1b49ac727422",
          object: "c_task",
          path: "/c_tasks/6255b918b86b1b49ac727422"
        },
        _id: "6255b918b86b1b5f73727480",
        object: "c_step"
      },
      {
        c_key: "9bed377e-4f9b-44db-9420-62dfe58c4f60",
        c_parent_step: {
          _id: "6255b918b86b1bd6c8727446",
          object: "c_step",
          path: "/c_steps/6255b918b86b1bd6c8727446"
        },
        c_task: {
          _id: "6255b918b86b1b49ac727422",
          object: "c_task",
          path: "/c_tasks/6255b918b86b1b49ac727422"
        },
        _id: "6255b918b86b1b4e957274ae",
        object: "c_step"
      },
      {
        c_key: "0aed9c32-9de6-46d3-b1b1-08032632c852",
        c_study: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          path: "/c_studies/6255b8f88348d74431bc3d00"
        },
        _id: "62586b414acdda46f4d72314",
        object: "c_visit_schedule"
      },
      {
        c_key: "43e86cc6-9d9f-4674-9eb4-6d342093675d",
        c_study: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          path: "/c_studies/6255b8f88348d74431bc3d00"
        },
        c_visits: [
        ],
        _id: "6255b8f98348d73ac1bc3dc9",
        object: "c_group"
      },
      {
        c_key: "113640d5-407b-46c6-a90b-40bc1ef6a1d4",
        c_study: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          path: "/c_studies/6255b8f88348d74431bc3d00"
        },
        c_visits: [
        ],
        _id: "6255b8f98348d78b84bc3ddc",
        object: "c_group"
      },
      {
        c_key: "56563902-c34c-41cd-9f15-02a0aa9f2a3f",
        c_study: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          path: "/c_studies/6255b8f88348d74431bc3d00"
        },
        c_visits: [
        ],
        _id: "62573e2768b1073c0435f1e0",
        object: "c_group"
      },
      {
        c_key: "066b17f7-a26c-4e97-9818-72e08762fada",
        c_study: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          path: "/c_studies/6255b8f88348d74431bc3d00"
        },
        _id: "6258526c471bcd961f517595",
        object: "c_site"
      },
      {
        c_key: "8488b442-c695-4313-b200-938573f9ce70",
        c_assignment: {
          _id: "62573e3968b107d6d235f320",
          object: "c_task",
          path: "/c_tasks/62573e3968b107d6d235f320"
        },
        c_flow_rules: [
        ],
        c_group: {
          _id: "62573e2768b1073c0435f1e0",
          object: "c_group",
          path: "/c_groups/62573e2768b1073c0435f1e0"
        },
        c_sites: [
        ],
        _id: "62573e49e1332d6eb21d51a4",
        object: "c_group_task"
      },
      {
        c_key: "91bfa9d4-7ffd-4727-b459-df3e60f4f542",
        c_study: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          path: "/c_studies/6255b8f88348d74431bc3d00"
        },
        _id: "6255b8f88348d7cc7ebc3d64",
        object: "c_participant_schedule"
      },
      {
        c_key: "d59edf1d-f0c7-431a-a4ae-89d3f46e6c8d",
        c_study: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          path: "/c_studies/6255b8f88348d74431bc3d00"
        },
        _id: "6255b8f88348d7a43fbc3d89",
        object: "c_anchor_date_template"
      },
      {
        ec__key: "bd1a3dfa-f653-4cc2-aba5-aee8c7600431",
        ec__sites: [
          "6258526c471bcd961f517595"
        ],
        ec__study: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          path: "/c_studies/6255b8f88348d74431bc3d00"
        },
        _id: "625771ee3c82807697d67364",
        object: "ec__document_template"
      },
      {
        ec__key: "ec__default_doc_css",
        _id: "62585230b3d56e39213d692d",
        object: "ec__default_document_css"
      },
      {
        c_key: "735db4fe-a59f-469e-b7a8-b334e29c5497",
        _id: "6255b031b5bd285a1615ba9a",
        object: "c_looker_integration_record"
      }
    ],
    successRemovedEntities = [],
    successResult = undefined,
    noStudyOutputEntities = [],
    noStudyRemovedEntities = [
      {
        entity: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          created: "2022-04-12T17:38:00.175Z",
          creator: {
            _id: "6255ad09190824e9695d1c63",
            object: "account",
            path: "/accounts/6255ad09190824e9695d1c63",
          },
          owner: {
            _id: "6255ad09190824e9695d1c63",
            object: "account",
            path: "/accounts/6255ad09190824e9695d1c63",
          },
          updated: "2022-04-14T14:38:02.669Z",
          updater: {
            _id: "6255ad09190824e9695d1c63",
            object: "account",
            path: "/accounts/6255ad09190824e9695d1c63",
          },
          access: 7,
          accessRoles: [
            "000000000000000000000004",
            "000000000000000000000007",
            "000000000000000000000006",
          ],
          favorite: false,
          c_auth_task_fields: [
            "email",
            "password",
          ],
          c_self_service_info: {
            c_header: "Support",
          },
          c_default_subject_group: {
            _id: "6255b8f98348d73ac1bc3dc9",
            object: "c_group",
            path: "/c_groups/6255b8f98348d73ac1bc3dc9",
          },
          c_default_participant_schedule: {
            _id: "6255b8f88348d7cc7ebc3d64",
            object: "c_participant_schedule",
            path: "/c_participant_schedules/6255b8f88348d7cc7ebc3d64",
          },
          c_default_subject_site: {
            _id: "62574d989699ac84a4679c82",
            object: "c_site",
            path: "/c_sites/62574d989699ac84a4679c82",
          },
          c_default_subject_visit_schedule: {
            _id: "6257704bcc3565112a9017e5",
            object: "c_visit_schedule",
            path: "/c_visit_schedules/6257704bcc3565112a9017e5",
          },
          c_enable_alt_reg: false,
          c_forgot_username_options: [
            "email",
          ],
          c_information: [
          ],
          c_invite_code_ttl: -1,
          c_key: "696f47ee-bed0-4598-9ba4-3ada0c7f60a8",
          c_menu_config: [
          ],
          c_name: "CG183",
          c_patient_app_display_options: {
            c_profile_fields: [
              "c_account.name",
              "c_account.email",
              "c_account.dob",
              "c_account.mobile",
              "c_account.gender",
            ],
            c_show_consent_documents: true,
            c_show_language_selector: false,
            c_show_leave_study: true,
            c_show_site_information: false,
            c_show_subject_number: false,
          },
          c_privacy_items: [
          ],
          c_public_group: {
            _id: "6255b8f98348d78b84bc3ddc",
            object: "c_group",
            path: "/c_groups/6255b8f98348d78b84bc3ddc",
          },
          c_reasons_for_change: [
          ],
          c_requires_invite: true,
          c_resources: [
          ],
          c_review_types: [
          ],
          c_store_invite_data: true,
          c_study_contact_information: [
          ],
          c_subject_enrollment_status: "consented",
          c_subject_invite_validation: "email_pin",
          c_subject_menu_config: [
          ],
          c_subject_status_list: [
            {
              c_default: true,
              c_key: "bb4600eb-2b2c-4768-b471-5a4fef6637e4",
              c_status_description: "Subject has been created",
              c_status_value: "new",
              _id: "6255b8f81b7acdab9f14397b",
            },
            {
              c_default: false,
              c_key: "5913be90-cf45-49ce-9f80-2191660064b9",
              c_status_description: "Subject has been assigned an subject ID",
              c_status_value: "consented",
              _id: "6255b8f81b7acdab9f14397c",
            },
            {
              c_default: false,
              c_key: "eac06b0b-162e-4c74-9a3e-ef773efbee3e",
              c_status_description: "Subject has completed the study",
              c_status_value: "complete",
              _id: "6255b8f81b7acdab9f14397d",
            },
          ],
          c_supported_locales: [
            "en_US",
          ],
          c_site_supported_locales: [
          ],
          c_use_advanced_task_scheduler: true,
          c_unique_org_study: "c_unique_org_study",
          c_login_identifier: "email",
          c_use_secure_flag: false,
          c_enable_secured_reg_data: false,
          c_no_pii: false,
          shared: false,
        },
        issues: [
          "The object c_study (6255b8f88348d74431bc3d00) is removed from export because it depends on c_default_subject_site (62574d989699ac84a4679c82) which doesn't exist",
          "The object c_study (6255b8f88348d74431bc3d00) is removed from export because it depends on c_default_subject_visit_schedule (6257704bcc3565112a9017e5) which doesn't exist",
        ],
      }
    ],
    noStudyResult = {
      message: 'Study cannot be exported due to referential integrity issues',
      reason: `["The object c_study (6255b8f88348d74431bc3d00) is removed from export because it depends on c_default_subject_site (62574d989699ac84a4679c82) which doesn't exist","The object c_study (6255b8f88348d74431bc3d00) is removed from export because it depends on c_default_subject_visit_schedule (6257704bcc3565112a9017e5) which doesn't exist"]`
    },
    noCssOutputEntities = [
      {
        ec__key: "bd1a3dfa-f653-4cc2-aba5-aee8c7600431",
        ec__sites: [],
        ec__study: {
          _id: "6255b8f88348d74431bc3d00",
          object: "c_study",
          path: "/c_studies/6255b8f88348d74431bc3d00",
        },
        _id: "625771ee3c82807697d67364",
        object: "ec__document_template",
      }
    ],
    noCssRemovedEntities = [],
    noCssResult = {
      message: 'Export cannot be completed because there is no ec__default_document_css',
      reason: 'Exports that contain EC templates must also contain an EC default document CSS'
    }

  it.each([
    ['should allow valid exports to pass without error', successOutputEntities, successRemovedEntities, successResult],
    ['should abort export if c_study is removed from entities', noStudyOutputEntities, noStudyRemovedEntities, noStudyResult],
    ['should abort export if ec__document template is present but ec__default_document_css is not', noCssOutputEntities, noCssRemovedEntities, noCssResult]
  ])('%s', (test, outputEntities, removedEntities, expected) => {
    let exportIntegrityErr

    try {
      studyManifestTools.checkExportIntegrity(outputEntities, removedEntities)
    } catch (err) {
      exportIntegrityErr = err
    }

    expect(exportIntegrityErr)
    .toStrictEqual(expected)
  })
})
