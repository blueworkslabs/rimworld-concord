using System;
namespace Concord {
    // job.count is additional pickup, not the final size of an existing carried load.
    public static class HaulBudget {
        public static int AdditionalPickup(int carried,int requested,int available,int space) {
            return Math.Max(0,Math.Min(Math.Min(requested,space),available-carried));
        }
    }
}
