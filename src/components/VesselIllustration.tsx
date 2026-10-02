export function VesselIllustration() {
  return (
    <svg className="vessel-illustration" viewBox="0 0 600 170" fill="none" aria-hidden="true">
      <path d="M20 142H580M75 153H215M350 153H531" stroke="#DFE4E7" strokeWidth="2" />
      <path d="M70 115L510 115L558 97L537 130L511 141H91L70 115Z" fill="#263846" />
      <path d="M92 129H535L524 136H95L92 129Z" fill="#C30D7C" />
      <path d="M516 114L548 102L538 119" stroke="#96A0A9" strokeWidth="2" />
      <path d="M104 94H483V115H104V94Z" fill="#F1F3F4" />
      <path d="M100 65H151V108H100V65Z" fill="#DFE5E8" />
      <path d="M96 55H157V67H96V55Z" fill="#F4F6F7" stroke="#C9D2D8" />
      <path d="M106 44H146V55H106V44Z" fill="#E5E9EB" />
      <path d="M113 31H136V44H113V31Z" fill="#CCD5DC" />
      <path d="M124 13V31M124 21H147M139 21V31" stroke="#6E7D88" strokeWidth="2" />
      <path d="M107 59H114M119 59H126M131 59H138M143 59H150" stroke="#607889" strokeWidth="3" />
      <path d="M114 81H136M114 88H136M114 95H136" stroke="#F8F9FA" strokeWidth="3" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((column) => (
        <g key={column}>
          {[0, 1, 2].map((row) => (
            <g key={row}>
              <rect x={165 + column * 41} y={105 - row * 18} width="39" height="16" rx="1" fill={(column + row) % 4 === 0 ? '#7D8992' : (column + row) % 5 === 0 ? '#D4DADE' : '#BC177B'} />
              <path d={`M${171 + column * 41} ${108 - row * 18}v10m6-10v10m6-10v10m6-10v10m6-10v10`} stroke="#FFF" strokeOpacity=".16" />
            </g>
          ))}
        </g>
      ))}
      <path d="M67 111H108M88 97V110M84 99H97" stroke="#657984" strokeWidth="2" />
      <text x="301" y="128" fill="white" fontSize="10" fontWeight="800" fontStyle="italic" fontFamily="Arial, sans-serif" letterSpacing="1">ONE</text>
      <path d="M58 141H560" stroke="#93A6B1" strokeWidth="2" />
    </svg>
  );
}
