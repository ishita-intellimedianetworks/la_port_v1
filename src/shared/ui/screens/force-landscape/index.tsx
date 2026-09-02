"use client";
import { useEffect } from "react";
import { useOrientation } from "@/shared/stores/use-orientation";
import { usePortrait } from "@/shared/responsive";

/**
 * The rotate-your-device guard. THE APP IS LANDSCAPE ONLY.
 *
 * The question is just "is this viewport taller than it is wide?", and it is
 * asked of every device — matching ARCHVIZ_WITH_EXTERIOR, whose guard is a
 * bare `innerWidth > innerHeight`. A portrait window gets the rotate screen
 * whatever it is running on.
 *
 * That is a deliberate widening. This used to gate on portrait AND phone-width
 * AND a coarse pointer, so that a tablet held upright — which has room for the
 * whole UI — and a desktop browser in a tall window, which cannot rotate
 * anything, both got the app instead of a dead end. Landscape-only is the
 * product decision, so those cases now see the prompt too; a desktop user
 * widens the window rather than turning anything.
 *
 * `isLandscape` is published to the shared store for anything that wants the
 * raw orientation.
 */
const ForceLandscape = () => {
  // A selector, not the whole store: a no-selector subscription re-renders on
  // every write because zustand's set() always makes a new state object.
  const setLandscape = useOrientation((s) => s.setLandscape);
  // Asked as PORTRAIT so SSR's "false for everything" means "don't show the
  // guard" — see PORTRAIT_MEDIA_QUERY. Negating a landscape query instead
  // would put the rotate screen in the server HTML.
  const portrait = usePortrait();

  useEffect(() => {
    setLandscape(!portrait);
  }, [portrait, setLandscape]);

  if (!portrait) return null;
  return (
    // `inset-0` + `100dvh`, not `h-screen w-screen`: `100vh` on a mobile
    // browser is the tall viewport WITH the address bar rolled away, so the
    // prompt's own copy ends up under the browser chrome on the exact devices
    // this screen exists for. `w-screen` is the same trap on the other axis
    // when a scrollbar is showing.
    <div className="fixed inset-0 z-[2147483645] flex h-[100dvh] w-full items-center justify-center bg-white text-[#14142B]">
      <div className="flex w-3/4 max-w-sm flex-col items-center justify-center text-center">
        <div className="flex w-full items-center justify-center">
          <svg
            className="w-1/3 max-w-[140px]"
            version="1.1"
            id="Capa_1"
            xmlns="http://www.w3.org/2000/svg"
            x="0px"
            y="0px"
            viewBox="0 0 488.631 488.631"
            role="img"
            aria-label="Rotate your device to landscape"
          >
            <g>
              <path
                fill="currentColor"
                d="M443.762,251.057H282.306v34.625l161.592,0.072l-0.079,168.314c0,0-0.016,0-0.057,0l-161.464-0.064
		c-0.006,12.669-3.686,24.393-9.667,34.626h171.131c19.138,0,34.699-15.561,34.699-34.697V285.754
		C478.461,266.634,462.9,251.057,443.762,251.057z"
              />
              <path
                fill="currentColor"
                d="M213.053,100.678H44.867c-19.128,0-34.697,15.569-34.697,34.697v318.558
		c0,19.136,15.569,34.697,34.697,34.697h80.338h87.848c19.122,0,34.691-15.561,34.691-34.697V135.375
		C247.744,116.247,232.175,100.678,213.053,100.678z M44.867,135.232l168.314,0.143l-0.072,283.972H44.748L44.867,135.232z
		 M110.633,453.017c0-10.113,8.202-18.316,18.308-18.316c10.146,0,18.349,8.202,18.349,18.316c0,10.122-8.202,18.341-18.349,18.341
		C118.835,471.357,110.633,463.139,110.633,453.017z"
              />
              <path
                fill="currentColor"
                d="M361.752,128.511h-23.054c-1.673,0-3.171,1.003-3.815,2.558c-0.629,1.528-0.279,3.312,0.899,4.483
		l40.448,40.455c1.616,1.602,4.221,1.602,5.837,0l40.448-40.455c1.171-1.171,1.53-2.955,0.9-4.483
		c-0.638-1.555-2.143-2.558-3.815-2.558h-23.293C395.001,57.443,336.873,0,265.503,0c-9.541,0-17.273,7.732-17.273,17.273
		c0,9.55,7.732,17.29,17.273,17.29C317.825,34.563,360.454,76.492,361.752,128.511z"
              />
            </g>
          </svg>
        </div>
        <p className="mt-8 text-balance text-[15px] leading-snug">
          Please rotate your device to get started
        </p>
      </div>
    </div>
  );
};

export default ForceLandscape;
