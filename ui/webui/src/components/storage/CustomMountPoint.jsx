/*
 * Copyright (C) 2023 Red Hat, Inc.
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

import cockpit from "cockpit";
import React, { useState, useEffect } from "react";

import {
    Alert,
    Checkbox,
    Flex,
    HelperText,
    HelperTextItem,
    Popover,
    Select,
    SelectOption,
    SelectVariant,
    TextContent,
} from "@patternfly/react-core";
import { HelpIcon } from "@patternfly/react-icons";

import { ListingTable } from "cockpit-components-table.jsx";
import { EmptyStatePanel } from "cockpit-components-empty-state.jsx";
import { AnacondaPage } from "../AnacondaPage.jsx";

import {
    createPartitioning,
    setBootloaderDrive,
    setManualPartitioningRequests,
} from "../../apis/storage.js";

import "./CustomMountPoint.scss";

const _ = cockpit.gettext;

const MountPointSelect = ({ partition, requests, mountpoint, handleOnSelect, isDisabled }) => {
    // TODO: extend?
    const defaultOptions = [
        { value: "/", name: "root" },
        { value: "/boot", name: "boot" },
        { value: "/home", name: "home" },
    ];

    const duplicatedMountPoint = mountpoint => {
        return requests.filter(r => r["mount-point"] === mountpoint).length > 1;
    };

    const [isOpen, setIsOpen] = useState(false);
    // Filter selected
    const options = defaultOptions.filter(val => val.value !== mountpoint);
    if (mountpoint !== "") {
        options.push({ value: mountpoint });
    }

    return (
        <Flex direction={{ default: "column" }} spaceItems={{ default: "spaceItemsNone" }}>
            <Select
              variant={SelectVariant.typeahead}
              className="mountpoint-select"
              typeAheadAriaLabel={_("Select a mount point")}
              selections={mountpoint || null}
              isOpen={isOpen}
              onToggle={isOpen => setIsOpen(isOpen)}
              onSelect={(_evt, selection, _) => { setIsOpen(false); handleOnSelect(selection, partition) }}
              isDisabled={isDisabled}
              isCreatable
              shouldResetOnSelect
            >
                {options.map((option, index) => (
                    <SelectOption
                      key={index}
                      className={`select-option-${option.name}`}
                      value={option.value}
                    />
                ))}
            </Select>
            {mountpoint !== "" && duplicatedMountPoint(mountpoint) &&
                <HelperText>
                    <HelperTextItem variant="error" hasIcon>
                        {_("Duplicate mount point.")}
                    </HelperTextItem>
                </HelperText>}
        </Flex>
    );
};

const MountpointCheckbox = ({ reformat, isRootMountPoint, handleCheckReFormat, partition, isDisabled }) => {
    return (
        <Flex>
            <Checkbox
              label={_("Format")}
              isChecked={reformat}
              isDisabled={isRootMountPoint || isDisabled}
              onChange={(checked, _) => handleCheckReFormat(checked, partition)}
              id={partition}
            />
            {isRootMountPoint &&
                <Popover
                  bodyContent={_("The root partition is always re-formatted by the installer.")}
                  showClose={false}>
                    <HelpIcon />
                </Popover>}
        </Flex>
    );
};

export const CustomMountPoint = ({ deviceData, partitioningData, dispatch, idPrefix, setIsFormValid, onAddErrorNotification, toggleContextHelp, stepNotification }) => {
    const [creatingPartitioning, setCreatingPartitioning] = useState(true);
    useEffect(() => {
        const validateMountPoints = requests => {
            if (requests) {
                const mountPoints = requests.map(r => r["mount-point"]);

                setIsFormValid(new Set(mountPoints).size === mountPoints.length);
            }
        };

        validateMountPoints(partitioningData?.requests);
    }, [partitioningData?.requests, setIsFormValid]);

    useEffect(() => {
        if (partitioningData?.method === "MANUAL") {
            setCreatingPartitioning(false);
        } else {
            /* Reset the bootloader drive before we schedule partitions
             * The bootloader drive is automatically set during the partitioning, so
             * make sure we always reset the previous value before we run another one,
             * so it can be automatically set again based on the current disk selection.
             * Otherwise, the partitioning can fail with an error.
             */
            setBootloaderDrive({ drive: "" })
                    .then(() => createPartitioning({ method: "MANUAL" }))
                    .then(() => setCreatingPartitioning(false));
        }
    }, [partitioningData?.method]);

    if (creatingPartitioning) {
        return <EmptyStatePanel loading />;
    }

    const requestsToDbus = requests => {
        return requests.map(row => {
            return {
                "device-spec": cockpit.variant("s", row["device-spec"]),
                "format-type": cockpit.variant("s", row["format-type"]),
                "mount-point": cockpit.variant("s", row["mount-point"]),
                reformat: cockpit.variant("b", row.reformat),
            };
        });
    };

    const handleOnSelect = (selection, device) => {
        const newRequests = partitioningData.requests.map(row => {
            const newRow = { ...row };
            if (row["device-spec"] === device) {
                // Reset reformat option when changing from /
                if (row["mount-point"] === "/" && selection !== row["mount-point"] && row.reformat) {
                    newRow.reformat = false;
                }

                // Always reformat the root partition
                if (selection === "/") {
                    newRow.reformat = true;
                }

                newRow["mount-point"] = selection;
            }
            return newRow;
        });
        setManualPartitioningRequests({ partitioning: partitioningData.path, requests: requestsToDbus(newRequests) }).catch(onAddErrorNotification);
    };

    const handleCheckReFormat = (checked, mountpoint) => {
        const newRequests = partitioningData.requests.map(row => {
            const newRow = { ...row };
            if (row["device-spec"] === mountpoint) {
                newRow.reformat = checked;
            }
            return newRow;
        });
        setManualPartitioningRequests({ partitioning: partitioningData.path, requests: requestsToDbus(newRequests) }).catch(onAddErrorNotification);
    };

    const renderRow = row => {
        const isRootMountPoint = row["mount-point"] === "/";
        const isNotMountPoint = ["biosboot"].includes(row["format-type"]);
        // TODO: Anaconda does not support formatting btrfs yet
        const isBtrfs = row["format-type"] === "btrfs";
        return {
            props: { key: row["device-spec"] },
            columns: [
                { title: row["device-spec"] },
                { title: row["format-type"] },
                {
                    title: (
                        <MountPointSelect
                          handleOnSelect={handleOnSelect}
                          isDisabled={isNotMountPoint}
                          mountpoint={row["mount-point"]}
                          partition={row["device-spec"]}
                          requests={partitioningData.requests}
                        />
                    )
                },
                {
                    title: (
                        <MountpointCheckbox
                          reformat={row.reformat}
                          isRootMountPoint={isRootMountPoint}
                          partition={row["device-spec"]}
                          handleCheckReFormat={handleCheckReFormat}
                          isDisabled={isNotMountPoint || isBtrfs}
                        />
                    )
                },
            ],
        };
    };

    const partitionRows = partitioningData?.requests?.map(renderRow) || [];

    return (
        <AnacondaPage title={_("Select a custom mount point")}>
            {stepNotification && stepNotification.step === "custom-mountpoint" &&
                <Alert
                  isInline
                  title={stepNotification.message}
                  variant="danger"
                />}
            <TextContent>
                {_("We discovered your partitioned and formatted filesystems, so now you can select your own custom mount point for each filesystem.")}
            </TextContent>
            <ListingTable
              aria-label={_("Partitions")}
              columns={[_("Partition"), _("Format type"), _("Mount point"), _("Reformat")]}
              emptyCaption={_("No partitions")}
              id="custom-mountpoint-table"
              rows={partitionRows} />
        </AnacondaPage>
    );
};
