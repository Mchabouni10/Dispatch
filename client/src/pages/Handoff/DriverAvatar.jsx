import React, { useState } from "react";
import { resolveUploadUrl } from "../../api/api.js";
import { initials } from "./handoffHelpers.js";
import styles from "./HandoffView.module.css";
import localStyles from "./NotCheckedInColumn.module.css";

/**
 * DriverAvatar Component
 * - Resolves upload URLs properly via resolveUploadUrl
 * - Gracefully falls back to styled initials when photo is missing or fails to load (404/network)
 * - Supports size variants: "sm" (28px), "md" (38px), "lg" (48px)
 * - Supports optional urgency / status rings
 */
export default function DriverAvatar({
  driver,
  size = "md", // "sm" | "md" | "lg"
  urgency, // "late" | "soon" | "stale" | "idle"
  className = "",
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const rawPhoto = driver?.photo;
  const photoUrl = rawPhoto ? resolveUploadUrl(rawPhoto) : null;
  const hasImage = Boolean(photoUrl) && !imgFailed;
  const driverName = driver?.name || "";

  const sizeClass =
    size === "sm"
      ? styles.avatarSm
      : size === "lg"
        ? localStyles.avatarLg
        : styles.avatarMd;

  const ringClass = urgency
    ? {
        late: localStyles.ringLate,
        soon: localStyles.ringSoon,
        stale: localStyles.ringStale,
      }[urgency] || localStyles.ringIdle
    : "";

  if (urgency) {
    return (
      <div className={`${localStyles.avatarWrap} ${ringClass} ${className}`}>
        {hasImage ? (
          <img
            src={photoUrl}
            alt={driverName}
            className={`${localStyles.avatarImgLg} ${
              imgLoaded ? localStyles.avatarImgLoaded : ""
            }`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className={`${styles.avatar} ${localStyles.avatarLg}`}>
            {initials(driverName)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.avatarContainer} ${sizeClass} ${className}`}>
      {hasImage ? (
        <img
          src={photoUrl}
          alt={driverName}
          className={`${styles.avatarImg} ${sizeClass} ${
            imgLoaded ? styles.avatarImgLoaded : ""
          }`}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className={`${styles.avatar} ${sizeClass}`}>
          {initials(driverName)}
        </div>
      )}
    </div>
  );
}
