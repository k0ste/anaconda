/*
 * Copyright (C) 2022 Red Hat, Inc.
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with This program; If not, see <http://www.gnu.org/licenses/>.
 */

import React, { useContext, useEffect, useState } from "react";
import cockpit from "cockpit";

import {
    ActionGroup,
    Button,
    Form, FormGroup,
    PageSection,
    SelectGroup, SelectOption, Select, SelectVariant,
    Title,
} from "@patternfly/react-core";

import { AddressContext } from "./Common.jsx";

import { useEvent, useObject } from "hooks";

const _ = cockpit.gettext;

const getLanguageEnglishName = lang => lang["english-name"].v;
const getLanguageId = lang => lang["language-id"].v;
const getLanguageNativeName = lang => lang["native-name"].v;
const getLocaleId = locale => locale["locale-id"].v;
const getLocaleNativeName = locale => locale["native-name"].v;

const LanguageSelector = ({ lang, onSelectLang }) => {
    const [isOpen, setIsOpen] = useState();
    const [languages, setLanguages] = useState([]);
    const [locales, setLocales] = useState({});
    const [selectedItem, setSelectedItem] = useState();
    const address = useContext(AddressContext);

    const localizationProxy = useObject(() => {
        const client = cockpit.dbus("org.fedoraproject.Anaconda.Modules.Localization", { superuser: "try", bus: "none", address });
        const proxy = client.proxy(
            "org.fedoraproject.Anaconda.Modules.Localization",
            "/org/fedoraproject/Anaconda/Modules/Localization",
        );

        return proxy;
    }, null, [address]);

    useEvent(localizationProxy, "changed", (event, data) => {
        localizationProxy.GetLanguages().then(languages => {
            // Create the languages state object
            Promise.all(languages.map(lang => localizationProxy.GetLanguageData(lang))).then(setLanguages);

            // Create the locales state object
            Promise.all(languages.map(lang => localizationProxy.GetLocales(lang))).then(res => {
                return Promise.all(
                    res.map((langLocales) => {
                        return Promise.all(langLocales.map(locale => localizationProxy.GetLocaleData(locale)));
                    })
                );
            })
                    .then(setLocales);
        });
    });

    useEffect(() => {
        // Once the component state contains the locale data from the API set the default selected language
        if (selectedItem || !locales.length) {
            return;
        }

        const languageId = lang.split("_")[0];
        const currentLangLocales = locales.find(langLocales => getLanguageId(langLocales[0]) === languageId);
        const currentLocale = currentLangLocales.find(locale => getLocaleId(locale) === lang);

        setSelectedItem(getLocaleNativeName(currentLocale));
    }, [locales, lang, selectedItem]);

    const handleOnSelect = (event, lang) => {
        onSelectLang(lang.localeId);
        setSelectedItem(lang);
    };

    const isLoading = languages.length !== locales.length;
    const options = (
        !isLoading
            ? locales.map(langLocales => {
                const currentLang = languages.find(lang => getLanguageId(lang) === getLanguageId(langLocales[0]));

                return (
                    <SelectGroup
                      label={cockpit.format("$0 ($1)", getLanguageNativeName(currentLang), getLanguageEnglishName(currentLang))}
                      key={getLanguageId(currentLang)}>
                        {langLocales.map(locale => (
                            <SelectOption
                              id={getLocaleId(locale).split(".UTF-8")[0]}
                              key={getLocaleId(locale)}
                              value={{
                                  toString: () => getLocaleNativeName(locale),
                                  // Add a compareTo for custom filtering - filter also by english name
                                  localeId: getLocaleId(locale)
                              }}
                            />
                        ))}
                    </SelectGroup>
                );
            })
            : []
    );

    return (
        <Select
          className="language-menu"
          isGrouped
          isOpen={isOpen}
          maxHeight="30rem"
          onClear={() => setSelectedItem(null)}
          onSelect={handleOnSelect}
          onToggle={setIsOpen}
          selections={selectedItem}
          toggleId="language-menu-toggle"
          variant={SelectVariant.typeahead}
          width="30rem"
          {...(isLoading && { loadingVariant: "spinner" })}

        >
            {options}
        </Select>
    );
};

export const InstallationLanguage = ({ onSelectLang }) => {
    const langCookie = (window.localStorage.getItem("cockpit.lang") || "en-us").split("-");
    const [lang, setLang] = useState(langCookie[0] + "_" + langCookie[1].toUpperCase() + ".UTF-8");

    const handleOnContinue = () => {
        if (!lang) {
            return;
        }

        /*
         * FIXME: Anaconda API returns en_US, de_DE etc, cockpit expects en-us, de-de etc
         * Make sure to check if this is generalized enough to keep so.
         */
        const cockpitLang = lang.split(".UTF-8")[0].replace(/_/g, "-").toLowerCase();
        const cookie = "CockpitLang=" + encodeURIComponent(cockpitLang) + "; path=/; expires=Sun, 16 Jul 3567 06:23:41 GMT";

        document.cookie = cookie;
        window.localStorage.setItem("cockpit.lang", cockpitLang);
        cockpit.location.go(["summary"]);
        window.location.reload(true);
    };

    return (
        <PageSection>
            <Form>
                <Title headingLevel="h2" size="1xl">
                    WELCOME TO FEDORA...
                </Title>
                <FormGroup label={_("What language would you like to use during the installation process?")}>
                    <LanguageSelector lang={lang} onSelectLang={setLang} />
                </FormGroup>
                <ActionGroup>
                    <Button id="continue-btn" variant="primary" onClick={handleOnContinue}>{_("Continue")}</Button>
                    <Button variant="link">{_("Quit")}</Button>
                </ActionGroup>
            </Form>
        </PageSection>
    );
};