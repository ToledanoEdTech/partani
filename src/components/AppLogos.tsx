import { LOGO1_SRC, LOGO2_SRC } from '../lib/branding';

type AppLogosProps = {
  className?: string;
  logoClassName?: string;
};

export function AppLogos({
  className = 'flex items-center gap-3',
  logoClassName = 'h-10 w-auto object-contain rounded',
}: AppLogosProps) {
  return (
    <div className={className}>
      <img src={LOGO1_SRC} alt="לוגו ראשי" className={logoClassName} />
      <img src={LOGO2_SRC} alt="לוגו משני" className={logoClassName} />
    </div>
  );
}
