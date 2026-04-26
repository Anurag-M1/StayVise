import * as React from "react";
import { Input } from "./Input";
import type { InputProps } from "./Input";
import { ChevronDown, Search } from "lucide-react";

export interface PhoneInputProps extends Omit<InputProps, 'prefixExt'> {
  onCountryChange?: (code: string) => void;
  selectedCountry?: string;
}

const COUNTRIES = [
  { code: "+91", name: "India", flag: "🇮🇳" },
  { code: "+1", name: "USA", flag: "🇺🇸" },
  { code: "+44", name: "UK", flag: "🇬🇧" },
  { code: "+971", name: "UAE", flag: "🇦🇪" },
  { code: "+1", name: "Canada", flag: "🇨🇦" },
  { code: "+61", name: "Australia", flag: "🇦🇺" },
  { code: "+65", name: "Singapore", flag: "🇸🇬" },
  { code: "+49", name: "Germany", flag: "🇩🇪" },
  { code: "+33", name: "France", flag: "🇫🇷" },
  { code: "+81", name: "Japan", flag: "🇯🇵" },
  { code: "+39", name: "Italy", flag: "🇮🇹" },
  { code: "+34", name: "Spain", flag: "🇪🇸" },
  { code: "+86", name: "China", flag: "🇨🇳" },
  { code: "+7", name: "Russia", flag: "🇷🇺" },
  { code: "+55", name: "Brazil", flag: "🇧🇷" },
  { code: "+27", name: "South Africa", flag: "🇿🇦" },
  { code: "+82", name: "South Korea", flag: "🇰🇷" },
  { code: "+52", name: "Mexico", flag: "🇲🇽" },
  { code: "+31", name: "Netherlands", flag: "🇳🇱" },
  { code: "+41", name: "Switzerland", flag: "🇨🇭" },
  { code: "+46", name: "Sweden", flag: "🇸🇪" },
  { code: "+47", name: "Norway", flag: "🇳🇴" },
  { code: "+45", name: "Denmark", flag: "🇩🇰" },
  { code: "+358", name: "Finland", flag: "🇫🇮" },
  { code: "+353", name: "Ireland", flag: "🇮🇪" },
  { code: "+64", name: "New Zealand", flag: "🇳🇿" },
  { code: "+60", name: "Malaysia", flag: "🇲🇾" },
  { code: "+66", name: "Thailand", flag: "🇹🇭" },
  { code: "+62", name: "Indonesia", flag: "🇮🇩" },
  { code: "+84", name: "Vietnam", flag: "🇻🇳" },
  { code: "+63", name: "Philippines", flag: "🇵🇭" },
  { code: "+90", name: "Turkey", flag: "🇹🇷" },
  { code: "+966", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+974", name: "Qatar", flag: "🇶🇦" },
  { code: "+965", name: "Kuwait", flag: "🇰🇼" },
  { code: "+973", name: "Bahrain", flag: "🇧🇭" },
  { code: "+968", name: "Oman", flag: "🇴🇲" },
  { code: "+20", name: "Egypt", flag: "🇪🇬" },
  { code: "+234", name: "Nigeria", flag: "🇳🇬" },
  { code: "+254", name: "Kenya", flag: "🇰🇪" },
  { code: "+233", name: "Ghana", flag: "🇬🇭" },
  { code: "+212", name: "Morocco", flag: "🇲🇦" },
  { code: "+54", name: "Argentina", flag: "🇦🇷" },
  { code: "+56", name: "Chile", flag: "🇨🇱" },
  { code: "+57", name: "Colombia", flag: "🇨🇴" },
  { code: "+51", name: "Peru", flag: "🇵🇪" },
  { code: "+92", name: "Pakistan", flag: "🇵🇰" },
  { code: "+880", name: "Bangladesh", flag: "🇧🇩" },
  { code: "+94", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "+977", name: "Nepal", flag: "🇳🇵" },
  { code: "+95", name: "Myanmar", flag: "🇲🇲" },
  { code: "+855", name: "Cambodia", flag: "🇰🇭" },
  { code: "+856", name: "Laos", flag: "🇱🇦" },
  { code: "+972", name: "Israel", flag: "🇮🇱" },
  { code: "+962", name: "Jordan", flag: "🇯🇴" },
  { code: "+961", name: "Lebanon", flag: "🇱🇧" },
  { code: "+963", name: "Syria", flag: "🇸🇾" },
  { code: "+964", name: "Iraq", flag: "🇮🇶" },
  { code: "+98", name: "Iran", flag: "🇮🇷" },
  { code: "+351", name: "Portugal", flag: "🇵🇹" },
  { code: "+30", name: "Greece", flag: "🇬🇷" },
  { code: "+32", name: "Belgium", flag: "🇧🇪" },
  { code: "+43", name: "Austria", flag: "🇦🇹" },
  { code: "+48", name: "Poland", flag: "🇵🇱" },
  { code: "+420", name: "Czech Republic", flag: "🇨🇿" },
  { code: "+421", name: "Slovakia", flag: "🇸🇰" },
  { code: "+36", name: "Hungary", flag: "🇭🇺" },
  { code: "+40", name: "Romania", flag: "🇷🇴" },
  { code: "+359", name: "Bulgaria", flag: "🇧🇬" },
  { code: "+380", name: "Ukraine", flag: "🇺🇦" },
  { code: "+354", name: "Iceland", flag: "🇮🇸" },
  { code: "+352", name: "Luxembourg", flag: "🇱🇺" },
  { code: "+356", name: "Malta", flag: "🇲🇹" },
  { code: "+357", name: "Cyprus", flag: "🇨🇾" },
  { code: "+372", name: "Estonia", flag: "🇪🇪" },
  { code: "+371", name: "Latvia", flag: "🇱🇻" },
  { code: "+370", name: "Lithuania", flag: "🇱🇹" },
  { code: "+385", name: "Croatia", flag: "🇭🇷" },
  { code: "+386", name: "Slovenia", flag: "🇸🇮" },
  { code: "+381", name: "Serbia", flag: "🇷🇸" },
  { code: "+382", name: "Montenegro", flag: "🇲🇪" },
  { code: "+387", name: "Bosnia", flag: "🇧🇦" },
  { code: "+355", name: "Albania", flag: "🇦🇱" },
  { code: "+383", name: "Kosovo", flag: "🇽🇰" },
  { code: "+213", name: "Algeria", flag: "🇩🇿" },
  { code: "+216", name: "Tunisia", flag: "🇹🇳" },
  { code: "+218", name: "Libya", flag: "🇱🇾" },
  { code: "+249", name: "Sudan", flag: "🇸🇩" },
  { code: "+251", name: "Ethiopia", flag: "🇪🇹" },
  { code: "+255", name: "Tanzania", flag: "🇹🇿" },
  { code: "+256", name: "Uganda", flag: "🇺🇬" },
  { code: "+211", name: "South Sudan", flag: "🇸🇸" },
  { code: "+260", name: "Zambia", flag: "🇿🇲" },
  { code: "+263", name: "Zimbabwe", flag: "🇿🇼" },
  { code: "+264", name: "Namibia", flag: "🇳🇦" },
  { code: "+267", name: "Botswana", flag: "🇧🇼" },
  { code: "+230", name: "Mauritius", flag: "🇲🇺" },
  { code: "+262", name: "Reunion", flag: "🇷🇪" },
  { code: "+248", name: "Seychelles", flag: "🇸🇨" },
  { code: "+261", name: "Madagascar", flag: "🇲🇬" },
  { code: "+244", name: "Angola", flag: "🇦🇴" },
  { code: "+238", name: "Cape Verde", flag: "🇨🇻" },
  { code: "+221", name: "Senegal", flag: "🇸🇳" },
  { code: "+225", name: "Cote d'Ivoire", flag: "🇨🇮" },
  { code: "+237", name: "Cameroon", flag: "🇨🇲" },
  { code: "+241", name: "Gabon", flag: "🇬🇦" },
  { code: "+242", name: "Congo", flag: "🇨🇬" },
  { code: "+243", name: "DR Congo", flag: "🇨🇩" },
];

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, onCountryChange, selectedCountry = "+91", label, error, ...props }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.target.value = e.target.value.replace(/[^\d\s]/g, "");
      if (onChange) onChange(e);
    };

    const filteredCountries = COUNTRIES.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase()) || 
      c.code.includes(search)
    );

    const currentCountry = COUNTRIES.find(c => c.code === selectedCountry) || COUNTRIES[0];

    return (
      <div className="relative w-full">
        <div className="flex gap-2 items-end">
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className={`flex items-center gap-2 h-[48px] px-3 bg-brand-white border rounded-md transition-all duration-fast text-brand-ink font-bold text-[14px] ${
                isOpen
                  ? "border-brand-forest ring-1 ring-brand-forest"
                  : "border-brand-border-strong hover:border-brand-forest"
              }`}
            >
              <span className="text-lg leading-none">{currentCountry.flag}</span>
              <span className="leading-none">{currentCountry.code}</span>
              <ChevronDown
                size={14}
                className={`text-brand-mist transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isOpen && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-brand-white border border-brand-border-strong rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2">
                <div className="p-3 border-b border-brand-border-strong bg-brand-fog/30">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-mist" />
                    <input 
                      type="text"
                      placeholder="Search 200+ countries..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-brand-white border border-brand-border-strong rounded-lg text-xs outline-none focus:ring-2 focus:ring-brand-forest/20 transition-all font-medium"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto scrollbar-thin">
                  {filteredCountries.map((c) => (
                    <button
                      key={c.code + c.name}
                      type="button"
                      onClick={() => {
                        if (onCountryChange) onCountryChange(c.code);
                        setIsOpen(false);
                        setSearch("");
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 hover:bg-brand-fog transition-colors text-left ${selectedCountry === c.code ? 'bg-brand-forest-light/30' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg leading-none">{c.flag}</span>
                        <span className="text-[14px] font-bold text-brand-ink">{c.name}</span>
                      </div>
                      <span className="text-[13px] font-mono font-bold text-brand-forest">{c.code}</span>
                    </button>
                  ))}
                  {filteredCountries.length === 0 && (
                    <div className="px-4 py-8 text-center text-xs text-brand-mist font-medium font-display">
                      No country found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1">
            <Input
              ref={ref}
              label={label || "Mobile Number"}
              error={error}
              value={value}
              onChange={handleChange}
              placeholder="000 000 0000"
              type="tel"
              className="w-full"
              {...props}
            />
          </div>
        </div>
      </div>
    );
  }
);
PhoneInput.displayName = "PhoneInput";
