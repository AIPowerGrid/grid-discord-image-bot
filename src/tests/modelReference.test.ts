import { ModelReferenceManager } from "../classes/modelReference";

describe("ModelReferenceManager", () => {
    let modelRefManager: ModelReferenceManager;

    beforeEach(() => {
        modelRefManager = new ModelReferenceManager("https://raw.githubusercontent.com/AIPowerGrid/image-model-reference/main/stable_diffusion.json");
        // Mock fetch implementation for testing
        global.fetch = jest.fn().mockImplementation(() => 
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    "SDXL 1.0": {
                        requirements: {
                            min_steps: 20,
                            max_steps: 100,
                            recommended_steps: 30,
                            recommended_cfg_scale: 7.0,
                            compatible_samplers: ["k_euler", "k_euler_a", "k_dpmpp_2m"],
                            compatible_schedulers: ["karras", "exponential"]
                        }
                    },
                    "Deliberate": {
                        requirements: {
                            min_steps: 10,
                            max_steps: 150,
                            recommended_steps: 25,
                            recommended_cfg_scale: 8.0,
                            compatible_samplers: ["k_euler", "k_euler_a", "k_dpmpp_2m"],
                            compatible_schedulers: ["normal", "karras"]
                        }
                    }
                })
            })
        );
    });

    test("should fetch model references successfully", async () => {
        await modelRefManager.fetchModelReferences();
        expect(modelRefManager.getModelReference("SDXL 1.0")).toBeDefined();
        expect(modelRefManager.getModelReference("Deliberate")).toBeDefined();
    });

    test("should apply model reference constraints correctly", async () => {
        await modelRefManager.fetchModelReferences();
        
        // Test with steps below minimum
        const params1 = { model: "SDXL 1.0", steps: 15, cfg_scale: 7.0, sampler_name: "k_euler", karras: true };
        const result1 = modelRefManager.applyModelReferenceConstraints(params1);
        expect(result1.steps).toBe(20); // Should be updated to min steps
        
        // Test with steps above maximum
        const params2 = { model: "Deliberate", steps: 200, cfg_scale: 8.0, sampler_name: "k_euler", karras: false };
        const result2 = modelRefManager.applyModelReferenceConstraints(params2);
        expect(result2.steps).toBe(150); // Should be updated to max steps
        
        // Test with incompatible sampler
        const params3 = { model: "SDXL 1.0", steps: 30, cfg_scale: 7.0, sampler_name: "DDIM", karras: true };
        const result3 = modelRefManager.applyModelReferenceConstraints(params3);
        expect(result3.sampler_name).toBe("k_dpmpp_2m"); // Should be updated to recommended sampler
        
        // Test with incompatible scheduler
        const params4 = { model: "Deliberate", steps: 25, cfg_scale: 8.0, sampler_name: "k_euler", karras: true };
        const result4 = modelRefManager.applyModelReferenceConstraints(params4);
        expect(result4.karras).toBe(true); // Should remain true as it's compatible
        
        // Test with model that doesn't exist
        const params5 = { model: "NonExistentModel", steps: 30, cfg_scale: 7.0, sampler_name: "k_euler", karras: true };
        const result5 = modelRefManager.applyModelReferenceConstraints(params5);
        expect(result5).toEqual(params5); // Should return original params unchanged
    });

    test("should handle fuzzy matching of model names", async () => {
        await modelRefManager.fetchModelReferences();
        
        // Test with slight variation in model name
        const params = { model: "SDXL", steps: 15, cfg_scale: 7.0, sampler_name: "k_euler", karras: true };
        const result = modelRefManager.applyModelReferenceConstraints(params);
        expect(result.steps).toBe(20); // Should match "SDXL 1.0" and update steps
    });
});
