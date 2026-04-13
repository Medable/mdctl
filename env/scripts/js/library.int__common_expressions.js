/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import { expressions } from 'decorators';

const { expression } = expressions;

/**
 * @classdesc Common expressions used by integrations platform
 * @class
 */
class CommonExpressions {

  @expression
  orac__transform_date_type = {
    $let: {
      vars: {
        transformedValue: {
          $moment: ['$$ROOT.value', { format: 'YYYY-MM-DD' }],
        },
      },
      in: {
        $object: {
          value: '$$transformedValue',
        },
      },
    },
  }

  @expression
  orac__transform_datetime_type = {
    $let: {
      vars: {
        value: {
          $moment: [
            '$$ROOT.value',
            { tz: '$$ROOT.timeZone' },
            { format: 'YYYY-MM-DDThh:mm:ss Z' },
          ],
        },
      },
      in: {
        $object: {
          value: '$$value',
        },
      },
    },
  }

  @expression
  orac__transform_text_choice_type = {
    $let: {
      vars: {
        value: {
          $map: {
            input: '$$ROOT.value',
            as: 'val',
            in: {
              $concat: [
                '{"value":"',
                {
                  $add: [
                    {
                      $pathTo: [
                        {
                          $orac__get_choice_text_order_of_value: {
                            stepId: '$$ROOT.stepId',
                            value: '$$val',
                          },
                        },
                        'order',
                      ],
                    },
                    1,
                  ],
                },
                '"}',
              ],
            },
          },
        },
      },
      in: {
        $object: {
          value: '$$value',
        },
      },
    },
  }

  @expression
  orac__transform_text_choice_type_make_string = {
    $let: {
      vars: {
        value: {
          $reduce: {
            input: {
              $pathTo: [
                { $orac__transform_text_choice_type: '$$ROOT' },
                'value',
              ],
            },
            initialValue: '',
            in: {
              $concat: ['$$value', ',', '$$this'],
            },
          },
        },
      },
      in: {
        $object: {
          value: {
            $concat: [
              '[',
              { $substr: ['$$value', 1, { $strLenCP: '$$value' }] },
              ']',
            ],
          },
        },
      },
    },
  }

  @expression
  orac__transform_ec_text_choice_type_get_template = {
    $let: {
      vars: {
        another: { $pathTo: ['$$ROOT', 'value'] },
        chech: {
          $map: {
            input: {
              $split: [
                {
                  $pathTo: [
                    {
                      $filter: {
                        input: {
                          $pathTo: [
                            {
                              $dbNext: {
                                $object: {
                                  grant: {
                                    $literal: 'read',
                                  },
                                  maxTimeMS: {
                                    $literal: 10000,
                                  },
                                  object: {
                                    $literal: 'ec__document_template',
                                  },
                                  operation: {
                                    $literal: 'cursor',
                                  },
                                  skipAcl: {
                                    $literal: true,
                                  },
                                  paths: 'ec__requested_data',
                                  where: {
                                    'ec__requested_data.ec__key': {
                                      $pathTo: ['$$ROOT', 'stepId'],
                                    },
                                  },
                                },
                              },
                            },
                            'ec__requested_data',
                          ],
                        },
                        as: 'e',
                        cond: {
                          $eq: [
                            '$$e.ec__key',
                            { $pathTo: ['$$ROOT', 'stepId'] },
                          ],
                        },
                      },
                    },
                    '0.ec__selection_options',
                  ],
                },
                '=,',
              ],
            },
            as: 'i',
            in: {
              // Eg Values Received: [Yes=Yes,No=No]
              // If we want left side of 'Yes=Yes' use 0, for right side use 1
              $pathTo: [{ $split: ['$$i', '='] }, '0'],
            },
          },
        },
      },
      in: {
        $object: {
          value: {
            $map: {
              input: {
                $reduce: {
                  input: '$$chech',
                  initialValue: { $array: [] },
                  as: 'value',
                  in: {
                    $filter: {
                      input: {
                        $concatArrays: [
                          '$$value',
                          {
                            $array: [
                              {
                                $object: {
                                  i: {
                                    $add: [
                                      { $indexOfArray: ['$$chech', '$$this'] },
                                      1,
                                    ],
                                  },
                                  val: '$$this',
                                  included: {
                                    $includes: ['$$another', '$$this'],
                                  },
                                },
                              },
                            ],
                          },
                        ],
                      },
                      as: 'v',
                      cond: { $pathTo: ['$$v', 'included'] },
                    },
                  },
                },
              },
              as: 'vv',
              in: {
                $concat: [
                  '{"value":"',
                  '$$vv.i',
                  '","label":"',
                  '$$vv.val',
                  '"}',
                ],
              },
            },
          },
        },
      },
    },
  }

  @expression
  orac__transform_ec_text_choice_type_make_string = {
    $let: {
      vars: {
        value: {
          $reduce: {
            input: {
              $pathTo: [
                { $orac__transform_ec_text_choice_type_get_template: '$$ROOT' },
                'value',
              ],
            },
            as: 'value',
            initialValue: '',
            in: {
              $concat: [
                '$$value',
                {
                  $cond: {
                    if: '$$value',
                    then: ', ',
                    else: '',
                  },
                },
                '$$this',
              ],
            },
          },
        },
      },
      in: {
        $object: {
          value: {
            $concat: ['[', '$$value', ']'],
          },
        },
      },
    },
  }

  @expression
  orac__transform_no_conversion = {
    $let: {
      vars: {
        value: '$$ROOT.value',
      },

      in: {
        $object: {
          value: '$$value',
        },
      },
    },
  }

  @expression
  orac__transform_location_type = {
    $let: {
      vars: {
        value: {
          $concat: [
            '$$ROOT.value.coordinates.0',
            ',',
            '$$ROOT.value.coordinates.1',
          ],
        },
      },

      in: {
        $object: {
          value: '$$value',
        },
      },
    },
  }

  @expression
  orac__transform_boolean_choice_type = {
    $let: {
      vars: {
        value: {
          $cond: {
            if: {
              $eq: ['$$ROOT.value', 'true'],
            },
            then: '[{"value":"1"}]',
            else: '[{"value":"2"}]',
          },
        },
      },

      in: {
        $object: {
          value: '$$value',
        },
      },
    },
  }

  @expression
  orac__transform_boolean_string_type = {
    $let: {
      vars: {
        value: {
          $cond: {
            if: {
              $eq: ['$$ROOT.value', 'true'],
            },
            then: 'TRUE',
            else: 'FALSE',
          },
        },
      },

      in: {
        $object: {
          value: '$$value',
        },
      },
    },
  }

  @expression
  orac__transform_image_capture_type = {
    $let: {
      vars: {
        value: '$$ROOT.value.filename',
      },
      in: {
        $object: {
          value: '$$value',
        },
      },
    },
  }

  @expression
  orac__get_image_choices_order_of_value = {
    $let: {
      vars: {
        choice: {
          $filter: {
            input: {
              $pathTo: [
                {
                  $dbNext: {
                    $object: {
                      grant: {
                        $literal: 'read',
                      },
                      maxTimeMS: {
                        $literal: 10000,
                      },
                      object: {
                        $literal: 'c_step',
                      },
                      operation: {
                        $literal: 'cursor',
                      },
                      skipAcl: {
                        $literal: true,
                      },
                      where: {
                        $object: {
                          _id: '$$ROOT.stepId',
                        },
                      },
                    },
                  },
                },
                'c_image_choices',
              ],
            },
            as: 'c',
            cond: { $eq: ['$$c.c_value', '$$ROOT.value'] },
          },
        },
      },
      in: {
        $object: {
          order: '$$choice.0.c_order',
        },
      },
    },
  }

  @expression
  orac__transform_image_choice_type = {
    $let: {
      vars: {
        order: {
          $orac__get_image_choices_order_of_value: {
            stepId: '$$ROOT.stepId',
            value: '$$ROOT.value.0',
          },
        },
      },
      in: {
        $object: {
          value: {
            $concat: ['[{"value":"', { $add: ['$$order.order', 1] }, '"}]'],
          },
        },
      },
    },
  }

  @expression
  orac__get_choice_text_order_of_value = {
    $let: {
      vars: {
        choice: {
          $filter: {
            input: {
              $pathTo: [
                {
                  $dbNext: {
                    $object: {
                      grant: {
                        $literal: 'read',
                      },
                      maxTimeMS: {
                        $literal: 10000,
                      },
                      object: {
                        $literal: 'c_step',
                      },
                      operation: {
                        $literal: 'cursor',
                      },
                      skipAcl: {
                        $literal: true,
                      },
                      where: {
                        $object: {
                          _id: '$$ROOT.stepId',
                        },
                      },
                    },
                  },
                },
                'c_text_choices',
              ],
            },
            as: 'c',
            cond: { $eq: ['$$c.c_value', '$$ROOT.value'] },
          },
        },
      },
      in: {
        $object: {
          order: '$$choice.0.c_order',
        },
      },
    },
  }

  @expression
  orac__transform_value_picker_type = {
    $let: {
      vars: {
        order: {
          $orac__get_choice_text_order_of_value: {
            stepId: '$$ROOT.stepId',
            value: '$$ROOT.value.0',
          },
        },
      },
      in: {
        $object: {
          value: {
            $concat: ['[{"value":"', { $add: ['$$order.order', 1] }, '"}]'],
          },
        },
      },
    },
  }

  @expression
  orac__transform_text_scale_type = {
    $let: {
      vars: {
        order: {
          $orac__get_choice_text_order_of_value: {
            stepId: '$$ROOT.stepId',
            value: '$$ROOT.value.0',
          },
        },
      },
      in: {
        $object: {
          value: {
            $concat: ['[{"value":"', { $add: ['$$order.order', 1] }, '"}]'],
          },
        },
      },
    },
  }

  @expression
  orac__translate_data = {
    $switch: {
      branches: [
        {
          case: {
            $or: [
              {
                $eq: ['$$ROOT.type', 'c_time_interval'],
              },
            ],
          },
          then: {
            $orac__transform_no_conversion: '$$ROOT',
          },
        },
        {
          case: {
            $or: [
              {
                $eq: ['$$ROOT.type', 'c_text'],
              },
              {
                $eq: ['$$ROOT.type', 'c_email'],
              },
              {
                $eq: ['$$ROOT.type', 'ec__text'],
              },
              {
                $eq: ['$$ROOT.type', 'ec__email'],
              },
              {
                $eq: ['$$ROOT.type', 'c_time_of_day'],
              },
            ],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'string'],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'text'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_no_conversion: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
        {
          case: {
            $eq: ['$$ROOT.type', 'c_barcode_scanner'],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'string'],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'text'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_no_conversion: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
        {
          case: {
            $eq: ['$$ROOT.type', 'c_boolean'],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'choice'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_boolean_choice_type: '$$ROOT',
                  },
                },
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', 'string'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_boolean_string_type: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
        {
          case: {
            $or: [
              {
                $eq: ['$$ROOT.type', 'c_numeric'],
              },
              {
                $eq: ['$$ROOT.type', 'ec__numeric'],
              },
              {
                $eq: ['$$ROOT.type', 'c_integer_scale'],
              },
              {
                $eq: ['$$ROOT.type', 'c_continuous_scale'],
              },
            ],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'numeric'],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'string'],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'text'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_no_conversion: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
        {
          case: {
            $or: [
              { $eq: ['$$ROOT.type', 'c_date'] },
              { $eq: ['$$ROOT.type', 'ec__date'] },
            ],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'date'],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'datetime'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_date_type: '$$ROOT',
                  },
                },
                {
                  case: {
                    $eq: ['$$ROOT.itemType', 'string'],
                  },
                  then: {
                    $orac__transform_no_conversion: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
        {
          case: {
            $eq: ['$$ROOT.type', 'c_datetime'],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'datetime'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_datetime_type: '$$ROOT',
                  },
                },
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', 'string'],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'text'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_no_conversion: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
        {
          case: {
            $eq: ['$$ROOT.type', 'c_location'],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'string'],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'text'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_location_type: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
        {
          case: {
            $eq: ['$$ROOT.type', 'c_image_capture'],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'string'],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'text'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_image_capture_type: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
        {
          case: {
            $eq: ['$$ROOT.type', 'c_image_choice'],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'choice'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_image_choice_type: '$$ROOT',
                  },
                },
                {
                  case: {
                    $eq: ['$$ROOT.itemType', 'string'],
                  },
                  then: {
                    $orac__transform_no_conversion: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
        {
          case: {
            $eq: ['$$ROOT.type', 'c_text_scale'],
          },
          then: {
            $orac__transform_text_scale_type: '$$ROOT',
          },
        },
        {
          case: {
            $eq: ['$$ROOT.type', 'c_text_choice'],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'choice'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_text_choice_type_make_string: '$$ROOT',
                  },
                },
                {
                  case: {
                    $eq: ['$$ROOT.itemType', 'string'],
                  },
                  then: {
                    $orac__transform_no_conversion: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
        {
          case: {
            $eq: ['$$ROOT.type', 'ec__text_choice'],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'choice'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_ec_text_choice_type_make_string: '$$ROOT',
                  },
                },
                {
                  case: {
                    $eq: ['$$ROOT.itemType', 'string'],
                  },
                  then: {
                    $orac__transform_no_conversion: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
        {
          case: {
            $eq: ['$$ROOT.type', 'c_value_picker'],
          },
          then: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      {
                        $eq: ['$$ROOT.itemType', ''],
                      },
                      {
                        $eq: ['$$ROOT.itemType', 'choice'],
                      },
                    ],
                  },
                  then: {
                    $orac__transform_value_picker_type: '$$ROOT',
                  },
                },
                {
                  case: {
                    $eq: ['$$ROOT.itemType', 'string'],
                  },
                  then: {
                    $orac__transform_no_conversion: '$$ROOT',
                  },
                },
              ],
            },
          },
        },
      ],
      default: {
        $literal: 'don\'t know how to convert it',
      },
    },
  }

  @expression
  orac__convert_to_timezone = {
    $let: {
      vars: {
        tz: '$$ROOT.siteTz',
        date: '$$ROOT.date',
      },
      in: {
        $moment: [
          '$$date',
          { tz: '$$tz' },
          { format: 'YYYY-MM-DDThh:mm:ss.SSS[Z]' },
        ],
      },
    },
  }

  @expression
  check__ec_document_status = {
    $and: [
      { $includes: ['$modified', 'ec__status'] },
      { $eq: [{ $pathTo: ['$current', 'ec__status'] }, 'complete'] },
      { $ne: [{ $pathTo: ['$old', 'ec__status'] }, 'complete'] },
    ],
  };

}

module.exports = CommonExpressions;