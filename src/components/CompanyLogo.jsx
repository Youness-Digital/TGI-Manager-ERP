import { useEffect, useState } from "react";
import defaultLogo from "../logo.png.jpeg";

export default function CompanyLogo({ src, alt = "Logo TGI Ascenseurs", className = "" }) {
  const [imageSrc, setImageSrc] = useState(src || defaultLogo);

  useEffect(() => {
    setImageSrc(src || defaultLogo);
  }, [src]);

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={`object-contain ${className}`}
      onError={() => {
        if (imageSrc !== defaultLogo) setImageSrc(defaultLogo);
      }}
    />
  );
}
