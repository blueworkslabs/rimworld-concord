using System;
namespace Concord {
    // job.count is additional pickup, not the final size of an existing carried load.
    public static class HaulBudget {
        // One trip delivers at most the source stack and the pawn's carry limit for that thing.
        public static int Deliverable(int requested,int available,int sourceStack,int carryLimit) {
            return Math.Max(0,Math.Min(Math.Min(requested,available),Math.Min(sourceStack,carryLimit)));
        }
        public static int AdditionalPickup(int carried,int requested,int available,int space) {
            return Math.Max(0,Math.Min(Math.Min(requested,space),available-carried));
        }
    }
}
