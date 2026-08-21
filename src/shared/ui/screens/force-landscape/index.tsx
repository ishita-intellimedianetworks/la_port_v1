"use client";
import { useEffect } from "react";
import { useOrientation } from "@/shared/stores/use-orientation";

const ForceLandscape = () => {
  // Selectors, not the whole store: a no-selector subscription re-renders on
  // every write because zustand's set() always makes a new state object.
  const isLandscape = useOrientation((s) => s.isLandscape);
  const setLandscape = useOrientation((s) => s.setLandscape);

  useEffect(() => {
    const update = () => {
      const landscape = window.innerWidth > window.innerHeight;
      setLandscape(landscape);
    };

    update();

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [setLandscape]);

  if (isLandscape) return null;
	return (
		<div className="fixed top-0 left-0 z-[2147483645] flex h-screen w-screen items-center justify-center bg-white text-[#14142B]">
			<div className="w-3/4 flex-col items-center justify-center text-center">
				<div className="flex items-center justify-center">
					<svg
						className="w-1/3"
						version="1.1"
						id="Capa_1"
						xmlns="http://www.w3.org/2000/svg"
						x="0px"
						y="0px"
						viewBox="0 0 488.631 488.631"
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
						<g></g>
						<g></g>
						<g></g>
						<g></g>
						<g></g>
						<g></g>
						<g></g>
						<g></g>
						<g></g>
						<g></g>
						<g></g>
						<g></g>
						<g></g>
						<g></g>
						<g></g>
					</svg>
				</div>
				<p className="mt-8">Please rotate your phone to get started</p>
			</div>
		</div>
	);
};

export default ForceLandscape;
