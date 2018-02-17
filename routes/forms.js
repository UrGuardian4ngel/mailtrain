'use strict';

let config = require('config');
let express = require('express');
let router = new express.Router();
let passport = require('../lib/passport');
let tools = require('../lib/tools');
let helpers = require('../lib/helpers');
let _ = require('../lib/translate')._;
let lists = require('../lib/models/lists');
let fields = require('../lib/models/fields');
let forms = require('../lib/models/forms');
let subscriptions = require('../lib/models/subscriptions');

router.all('/*', (req, res, next) => {
    if (!req.user) {
        req.flash('danger', _('Need to be logged in to access restricted content'));
        return res.redirect(config.www.baseDir + '/users/login?next=' + encodeURIComponent(req.originalUrl));
    }
    res.setSelectedMenu('lists');
    next();
});

router.get('/:list', passport.csrfProtection, (req, res) => {
    lists.get(req.params.list, (err, list) => {
        if (err) {
            req.flash('danger', err.message || err);
            return res.redirect(config.www.baseDir + '/');
        }

        if (!list) {
            req.flash('danger', _('Selected list ID not found'));
            return res.redirect(config.www.baseDir + '/');
        }

        forms.list(list.id, (err, rows) => {
            if (err) {
                req.flash('danger', err.message || err);
                return res.redirect(config.www.baseDir + '/forms/' + encodeURIComponent(req.params.list));
            }

            let index = 0;
            res.render('lists/forms/forms', {
                customForms: rows.map(row => {
                    row.index = ++index;
                    row.isDefaultForm = list.defaultForm === row.id;
                    return row;
                }),
                list,
                csrfToken: req.csrfToken()
            });
        });
    });
});

router.get('/:list/create', passport.csrfProtection, (req, res) => {
    lists.get(req.params.list, (err, list) => {
        if (err) {
            req.flash('danger', err.message || err);
            return res.redirect(config.www.baseDir + '/');
        }

        if (!list) {
            req.flash('danger', _('Selected list ID not found'));
            return res.redirect(config.www.baseDir + '/');
        }

        let data = {};
        data.csrfToken = req.csrfToken();
        data.list = list;

        res.render('lists/forms/create', data);
    });
});

router.post('/:list/create', passport.parseForm, passport.csrfProtection, (req, res) => {
    forms.create(req.params.list, req.body, (err, id) => {
        if (err || !id) {
            req.flash('danger', err && err.message || err || _('Could not create custom form'));
            return res.redirect(config.www.baseDir + '/forms/' + encodeURIComponent(req.params.list) + '/create?' + tools.queryParams(req.body));
        }
        req.flash('success', 'Custom form created');
        res.redirect(config.www.baseDir + '/forms/' + encodeURIComponent(req.params.list) + '/edit/' + id);
    });
});

router.get('/:list/edit/:form', passport.csrfProtection, (req, res) => {
    lists.get(req.params.list, (err, list) => {
        if (err) {
            req.flash('danger', err.message || err);
            return res.redirect(config.www.baseDir + '/');
        }

        if (!list) {
            req.flash('danger', _('Selected list ID not found'));
            return res.redirect(config.www.baseDir + '/');
        }

        forms.get(req.params.form, (err, form) => {
            if (err) {
                req.flash('danger', err.message || err);
                return res.redirect(config.www.baseDir + '/forms/' + encodeURIComponent(req.params.list));
            }

            if (!form) {
                req.flash('danger', _('Selected form not found'));
                return res.redirect(config.www.baseDir + '/forms/' + encodeURIComponent(req.params.list));
            }

            fields.list(list.id, (err, rows) => {
                if (err) {
                    req.flash('danger', err.message || err);
                    return res.redirect(config.www.baseDir + '/forms/' + encodeURIComponent(req.params.list));
                }

                let customFields = rows.map(row => {
                    row.type = fields.types[row.type];
                    return row;
                });

                let allFields = helpers.filterCustomFields(customFields, [], 'exclude');
                let fieldsShownOnSubscribe = allFields;
                let fieldsHiddenOnSubscribe = [];
                let fieldsShownOnManage = allFields;
                let fieldsHiddenOnManage = [];

                if (form.fieldsShownOnSubscribe) {
                    fieldsShownOnSubscribe = helpers.filterCustomFields(customFields, form.fieldsShownOnSubscribe, 'include');
                    fieldsHiddenOnSubscribe = helpers.filterCustomFields(customFields, form.fieldsShownOnSubscribe, 'exclude');
                }

                if (form.fieldsShownOnManage) {
                    fieldsShownOnManage = helpers.filterCustomFields(customFields, form.fieldsShownOnManage, 'include');
                    fieldsHiddenOnManage = helpers.filterCustomFields(customFields, form.fieldsShownOnManage, 'exclude');
                }

                let helpEmailText = _('The plaintext version for this email');
                let helpMjmlBase = _('Custom forms use MJML for formatting');
                let helpMjmlDocLink = _('See the MJML documentation <a class="mjml-documentation">here</a>');
                let helpMjmlGeneral = helpMjmlBase + ' ' + helpMjmlDocLink;

                let templateOptgroups = [
                    {
                        label: _('General'),
                        opts: [{
                            name: 'layout',
                            label: _('Layout'),
                            type: 'mjml',
                            help: helpMjmlGeneral,
                            isLayout: true
                        }, {
                            name: 'form_input_style',
                            label: _('Form Input Style'),
                            type: 'css',
                            help: _('This CSS stylesheet defines the appearance of form input elements and alerts')
                        }]
                    }, {
                        label: _('Subscribe'),
                        opts: [{
                            name: 'web_subscribe',
                            label: _('Web - Subscribe'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'web_confirm_subscription_notice',
                            label: _('Web - Confirm Subscription Notice'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'mail_confirm_subscription_html',
                            label: _('Mail - Confirm Subscription (MJML)'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'mail_confirm_subscription_text',
                            label: _('Mail - Confirm Subscription (Text)'),
                            type: 'text',
                            help: helpEmailText
                        }, {
                            name: 'mail_already_subscribed_html',
                            label: _('Mail - Already Subscribed (MJML)'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'mail_already_subscribed_text',
                            label: _('Mail - Already Subscribed (Text)'),
                            type: 'text',
                            help: helpEmailText
                        }, {
                            name: 'web_subscribed_notice',
                            label: _('Web - Subscribed Notice'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'mail_subscription_confirmed_html',
                            label: _('Mail - Subscription Confirmed (MJML)'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'mail_subscription_confirmed_text',
                            label: _('Mail - Subscription Confirmed (Text)'),
                            type: 'text',
                            help: helpEmailText
                        }]
                    }, {
                        label: _('Manage'),
                        opts: [{
                            name: 'web_manage',
                            label: _('Web - Manage Preferences'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'web_manage_address',
                            label: _('Web - Manage Address'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'web_updated_notice',
                            label: _('Web - Updated Notice'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }]
                    }, {
                        label: _('Unsubscribe'),
                        opts: [{
                            name: 'web_unsubscribe',
                            label: _('Web - Unsubscribe'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'web_confirm_unsubscription_notice',
                            label: _('Web - Confirm Unsubscription Notice'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'mail_confirm_unsubscription_html',
                            label: _('Mail - Confirm Unsubscription (MJML)'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'mail_confirm_unsubscription_text',
                            label: _('Mail - Confirm Unsubscription (Text)'),
                            type: 'text',
                            help: helpEmailText
                        }, {
                            name: 'mail_confirm_address_change_html',
                            label: _('Mail - Confirm Address Change (MJML)'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'mail_confirm_address_change_text',
                            label: _('Mail - Confirm Address Change (Text)'),
                            type: 'text',
                            help: helpEmailText
                        }, {
                            name: 'web_unsubscribed_notice',
                            label: _('Web - Unsubscribed Notice'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'mail_unsubscription_confirmed_html',
                            label: _('Mail - Unsubscription Confirmed (MJML)'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }, {
                            name: 'mail_unsubscription_confirmed_text',
                            label: _('Mail - Unsubscription Confirmed (Text)'),
                            type: 'text',
                            help: helpEmailText
                        }, {
                            name: 'web_manual_unsubscribe_notice',
                            label: _('Web - Manual Unsubscribe Notice'),
                            type: 'mjml',
                            help: helpMjmlGeneral
                        }]
                    }
                ];

                templateOptgroups.forEach(group => {
                    group.opts.forEach(opt => {
                        let key = tools.fromDbKey(opt.name);
                        opt.value = form[key];
                    });
                });

                subscriptions.listTestUsers(list.id, (err, testUsers) => {
                    res.render('lists/forms/edit', {
                        csrfToken: req.csrfToken(),
                        list,
                        form,
                        templateOptgroups,
                        fieldsShownOnSubscribe,
                        fieldsHiddenOnSubscribe,
                        fieldsShownOnManage,
                        fieldsHiddenOnManage,
                        testUsers,
                        useEditor: true
                    });
                });
            });
        });
    });
});

router.post('/:list/edit', passport.parseForm, passport.csrfProtection, (req, res) => {
    forms.update(req.body.id, req.body, (err, updated) => {
        if (err) {
            req.flash('danger', err.message || err);
        } else if (updated) {
            req.flash('success', _('Form settings updated'));
        } else {
            req.flash('info', _('Form settings not updated'));
        }

        if (req.body.id) {
            return res.redirect(config.www.baseDir + '/forms/' + encodeURIComponent(req.params.list) + '/edit/' + encodeURIComponent(req.body.id));
        } else {
            return res.redirect(config.www.baseDir + '/forms/' + encodeURIComponent(req.params.list));
        }
    });
});

router.post('/:list/delete', passport.parseForm, passport.csrfProtection, (req, res) => {
    forms.delete(req.body.id, (err, deleted) => {
        if (err) {
            req.flash('danger', err && err.message || err);
        } else if (deleted) {
            req.flash('success', _('Custom form deleted'));
        } else {
            req.flash('info', _('Could not delete specified form'));
        }

        return res.redirect(config.www.baseDir + '/forms/' + encodeURIComponent(req.params.list));
    });
});

module.exports = router;
